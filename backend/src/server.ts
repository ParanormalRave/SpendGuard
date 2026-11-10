import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { PublicKey } from "@solana/web3.js";
import { loadConfig } from "./config";
import { getRpcHostname } from "./chain/connection";
import { loadKeypair } from "./chain/keypairs";
import { fetchPolicy, getVaultBalance, type PolicyAccount } from "./chain/policy";
import { closeDb, deleteUser, getDb, getUserByWallet, initDb, listAlerts, readAttempts, readPayments, updatePreferences, upsertUser } from "./db";
import { createNonce, getNonceMessage, consumeNonce } from "./auth/nonce";
import { verifyWalletSignature } from "./auth/wallet";
import { verifyGoogleIdToken } from "./auth/google";
import { issueJwt, requireAuth } from "./auth/jwt";
import { buildAlertEmail, sendEmail } from "./notify/email";
import { API_SCENARIOS, loadServices, runAgent } from "./agent";
import { startWatcher } from "./watcher";

/**
 * HTTP layer for M4 step 4F (AGENTS.md section 6).
 *
 * Only the six routes of this milestone are mounted; alerts, auth and keeper
 * arrive in M5/M7. Errors always leave as `{ error: string }` — never a stack
 * trace, keypair path, API key or full RPC URL.
 */

const DEFAULT_LIMIT = 100;

type AsyncRoute = (req: Request, res: Response) => Promise<void>;

/** Express 4 does not catch rejected promises, so forward them to the error handler. */
function asyncHandler(route: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction): void => {
    route(req, res).catch(next);
  };
}

/** Masks provider keys that sometimes ride in RPC URLs or client messages. */
function sanitizeMessage(message: string): string {
  return message
    .replace(/([?&]api-key=)[^&\s]+/gi, "$1***")
    .replace(/([?&]key=)[^&\s]+/gi, "$1***");
}

function parseLimit(raw: unknown): number {
  const value = typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }
  return Math.floor(value);
}

function parsePolicyAddress(raw: string): PublicKey | null {
  try {
    return new PublicKey(raw);
  } catch {
    return null;
  }
}

/** JSON shape for one policy: amounts as decimal strings so u64 stays exact. */
function serializePolicy(address: string, policy: PolicyAccount, vaultBalance: number) {
  const allowedCount = policy.allowedCount as unknown as number;
  const allowedRecipients = (policy.allowedRecipients as unknown as { toBase58(): string }[])
    .slice(0, allowedCount)
    .map((key) => key.toBase58());

  const remaining = policy.windowLimit.sub(policy.spentInWindow);

  return {
    address,
    owner: policy.owner.toBase58(),
    agent: policy.agent.toBase58(),
    policyId: policy.policyId.toString(),
    perTxLimit: policy.perTxLimit.toString(),
    windowLimit: policy.windowLimit.toString(),
    windowSeconds: Number(policy.windowSeconds.toString()),
    windowStart: Number(policy.windowStart.toString()),
    spentInWindow: policy.spentInWindow.toString(),
    remainingInWindow: remaining.isNeg() ? "0" : remaining.toString(),
    withdrawDelaySeconds: Number(policy.withdrawDelaySeconds.toString()),
    paused: policy.paused,
    pendingAmount: policy.pendingAmount.toString(),
    pendingUnlockAt: Number(policy.pendingUnlockAt.toString()),
    allowedRecipients,
    allowedCount,
    vaultBalance,
  };
}

export function createApp(): express.Express {
  const config = loadConfig();
  const app = express();

  app.disable("x-powered-by");
  app.use(
    cors({
      origin: config.frontendOrigin,
      allowedHeaders: ["Authorization", "Content-Type"],
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    }),
  );
  app.use(express.json({ limit: "100kb" }));

  // ---------------------------------------------------------------- health

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "spendguard-backend",
      uptimeSeconds: Math.round(process.uptime()),
      rpc: getRpcHostname(),
      programId: config.programId.toBase58(),
    });
  });

  // ---------------------------------------------------------------- public config (agent address only)

  app.get("/config/public", (_req, res) => {
    try {
      const kp = loadKeypair(config.agentKeypairPath);
      const agentPublicKey = kp.publicKey.toBase58();
      if (!agentPublicKey) throw new Error("Invalid agent key");
      let policyAddress: string | null = null;
      if (config.policyAddress) {
        try {
          policyAddress = new PublicKey(config.policyAddress).toBase58();
        } catch {
          policyAddress = null;
        }
      }
      res.json({ agentPublicKey, policyAddress });
    } catch {
      res.status(503).json({ error: "Agent not configured" });
    }
  });

  // ---------------------------------------------------------------- services

  app.get("/services", (_req, res) => {
    res.json(loadServices());
  });

  // ---------------------------------------------------------------- policy

  app.get(
    "/policy/:address",
    asyncHandler(async (req, res) => {
      const address = req.params.address;
      const policyAddress = parsePolicyAddress(address);
      if (policyAddress === null) {
        res.status(400).json({ error: `Invalid policy address: "${address}"` });
        return;
      }

      try {
        const policy = await fetchPolicy(policyAddress);
        const vaultBalance = await getVaultBalance(policyAddress);
        res.json(serializePolicy(policyAddress.toBase58(), policy, vaultBalance));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.startsWith("No policy found")) {
          res.status(404).json({ error: message });
          return;
        }
        // An account exists but is not a Policy (wrong discriminator): also a 404.
        if (/discriminator/i.test(message)) {
          res.status(404).json({ error: `No policy found at ${address}` });
          return;
        }
        // RPC/network failures: log the sanitized message, return a generic one.
        console.error(`[server] GET /policy/${address} failed: ${sanitizeMessage(message)}`);
        res.status(502).json({ error: "Could not read policy from RPC" });
      }
    }),
  );

  app.get(
    "/policy/:address/payments",
    asyncHandler(async (req, res) => {
      const address = req.params.address;
      const policyAddress = parsePolicyAddress(address);
      if (policyAddress === null) {
        res.status(400).json({ error: `Invalid policy address: "${address}"` });
        return;
      }

      const payments = readPayments(getDb(), policyAddress.toBase58(), parseLimit(req.query.limit));
      res.json(
        payments.map((payment) => ({
          signature: payment.signature,
          policy: payment.policy,
          recipient: payment.recipient,
          amountLamports: payment.amount_lamports,
          timestamp: payment.timestamp,
        })),
      );
    }),
  );

  // ---------------------------------------------------------------- agent

  // Only one run at a time: overlapping runs would interleave payments and make
  // the activity feed impossible to read.
  let agentRunning = false;

  app.post(
    "/agent/run",
    asyncHandler(async (req, res) => {
      const body: unknown = req.body;
      if (body === null || typeof body !== "object" || Array.isArray(body)) {
        res.status(400).json({ error: "Body must be a JSON object" });
        return;
      }

      const { scenario, task } = body as { scenario?: unknown; task?: unknown };
      if (typeof scenario !== "string") {
        res.status(400).json({ error: 'Field "scenario" is required and must be a string' });
        return;
      }
      if (task !== undefined && typeof task !== "string") {
        res.status(400).json({ error: 'Field "task" must be a string when provided' });
        return;
      }
      if (!(API_SCENARIOS as readonly string[]).includes(scenario)) {
        res.status(400).json({ error: `Unknown scenario "${scenario}". Supported: ${API_SCENARIOS.join(", ")}` });
        return;
      }

      // Fail fast instead of hanging the request for a minute on a bad config.
      if (!config.llmApiKey || !config.llmModel) {
        res.status(503).json({
          error: "Agent is not configured: LLM_API_KEY and LLM_MODEL must be set",
        });
        return;
      }

      if (agentRunning) {
        res.status(409).json({ error: "Agent run already in progress" });
        return;
      }

      agentRunning = true;
      try {
        const result = await runAgent(scenario, typeof task === "string" ? task : undefined);
        res.json(result);
      } finally {
        agentRunning = false;
      }
    }),
  );

  app.get("/agent/attempts", (req, res) => {
    res.json(readAttempts(getDb(), parseLimit(req.query.limit)));
  });

  // ---------------------------------------------------------------- alerts

  app.get("/alerts", (req, res) => {
    const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

    const rawPolicy = req.query.policy;
    const rawOwner = req.query.owner;
    const rawLimit = req.query.limit;

    let policy: string | undefined;
    if (rawPolicy !== undefined) {
      if (typeof rawPolicy !== "string") {
        res.status(400).json({ error: 'Query param "policy" must be a string' });
        return;
      }
      const trimmed = rawPolicy.trim();
      if (trimmed.length === 0) {
        res.status(400).json({ error: 'Query param "policy" must not be empty' });
        return;
      }
      if (!BASE58_RE.test(trimmed)) {
        res.status(400).json({ error: 'Query param "policy" must be a base58 public key (32-44 chars, [1-9A-HJ-NP-Za-km-z])' });
        return;
      }
      policy = trimmed;
    }

    let owner: string | undefined;
    if (rawOwner !== undefined) {
      if (typeof rawOwner !== "string") {
        res.status(400).json({ error: 'Query param "owner" must be a string' });
        return;
      }
      const trimmed = rawOwner.trim();
      if (trimmed.length === 0) {
        res.status(400).json({ error: 'Query param "owner" must not be empty' });
        return;
      }
      if (!BASE58_RE.test(trimmed)) {
        res.status(400).json({ error: 'Query param "owner" must be a base58 public key (32-44 chars, [1-9A-HJ-NP-Za-km-z])' });
        return;
      }
      owner = trimmed;
    }

    let limit = 50;
    if (rawLimit !== undefined) {
      if (typeof rawLimit !== "string") {
        res.status(400).json({ error: 'Query param "limit" must be an integer between 1 and 200' });
        return;
      }
      const trimmed = rawLimit.trim();
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 1 || n > 200) {
        res.status(400).json({ error: 'Query param "limit" must be an integer between 1 and 200' });
        return;
      }
      limit = n;
    }

    const alerts = listAlerts(getDb(), { policy, owner, limit });
    res.json({ alerts });
  });

  // ---------------------------------------------------------------- auth

  app.get("/auth/nonce", (req, res) => {
    const raw = req.query.wallet;
    if (typeof raw !== "string" || !raw.trim()) {
      res.status(400).json({ error: "wallet is required" });
      return;
    }
    const wallet = raw.trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
      res.status(400).json({ error: "Invalid wallet" });
      return;
    }
    try {
      const { nonce, message, expiresAt } = createNonce(getDb(), wallet);
      res.json({ nonce, message, expiresAt });
    } catch (e) {
      res.status(500).json({ error: "Failed to create nonce" });
    }
  });

  app.post(
    "/auth/link",
    asyncHandler(async (req, res) => {
      const { idToken, wallet, signature, nonce } = req.body as {
        idToken?: unknown;
        wallet?: unknown;
        signature?: unknown;
        nonce?: unknown;
      };
      if (typeof idToken !== "string" || !idToken.trim() || typeof wallet !== "string" || !wallet.trim() || typeof signature !== "string" || !signature.trim() || typeof nonce !== "string" || !nonce.trim()) {
        res.status(400).json({ error: "idToken, wallet, signature and nonce are required" });
        return;
      }
      const w = wallet.trim();
      const n = nonce.trim();
      const sig = signature.trim();
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w)) {
        res.status(400).json({ error: "Invalid wallet" });
        return;
      }
      // Config checks before burning nonce
      const jwtSecret = loadConfig().jwtSecret;
      if (!jwtSecret || jwtSecret.length < 32) {
        res.status(503).json({ error: "Auth is not configured" });
        return;
      }
      if (!loadConfig().googleClientId) {
        res.status(503).json({ error: "Google sign-in is not configured" });
        return;
      }
      let google: { email: string; googleSub: string };
      try {
        google = await verifyGoogleIdToken(idToken.trim());
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("not configured")) {
          res.status(503).json({ error: msg });
          return;
        }
        res.status(401).json({ error: "Invalid Google token" });
        return;
      }
      const storedMessage = getNonceMessage(getDb(), w, n);
      if (!storedMessage) {
        res.status(400).json({ error: "Invalid or expired nonce" });
        return;
      }
      if (!verifyWalletSignature(w, storedMessage, sig)) {
        res.status(401).json({ error: "Invalid signature" });
        return;
      }
      const consumed = consumeNonce(getDb(), w, n);
      if (!consumed) {
        res.status(400).json({ error: "Invalid or expired nonce" });
        return;
      }
      upsertUser(getDb(), { wallet: w, email: google.email, googleSub: google.googleSub });
      const token = issueJwt({ wallet: w, email: google.email, googleSub: google.googleSub });
      res.json({ token, email: google.email });
    }),
  );

  app.get("/me", requireAuth, (req, res) => {
    const user = (req as unknown as { user: { wallet: string } }).user;
    const row = getUserByWallet(getDb(), user.wallet);
    if (!row) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ wallet: row.wallet, email: row.email, emailEnabled: !!row.email_enabled, minSeverity: row.min_severity });
  });

  app.put("/me/preferences", requireAuth, (req, res) => {
    const user = (req as unknown as { user: { wallet: string } }).user;
    const { emailEnabled, minSeverity } = req.body as { emailEnabled?: unknown; minSeverity?: unknown };
    if (emailEnabled !== undefined && typeof emailEnabled !== "boolean") {
      res.status(400).json({ error: "emailEnabled must be boolean" });
      return;
    }
    if (minSeverity !== undefined && !["info", "warning", "critical"].includes(minSeverity as string)) {
      res.status(400).json({ error: "minSeverity must be info, warning or critical" });
      return;
    }
    const updated = updatePreferences(getDb(), user.wallet, { emailEnabled: emailEnabled as boolean | undefined, minSeverity: minSeverity as "info" | "warning" | "critical" | undefined });
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ wallet: updated.wallet, email: updated.email, emailEnabled: !!updated.email_enabled, minSeverity: updated.min_severity });
  });

  app.delete("/me", requireAuth, (req, res) => {
    const user = (req as unknown as { user: { wallet: string } }).user;
    deleteUser(getDb(), user.wallet);
    res.json({ ok: true });
  });

  const notifyTestLast = new Map<string, number>();
  app.post("/notifications/test", requireAuth, asyncHandler(async (req, res) => {
    const user = (req as unknown as { user: { wallet: string } }).user;
    const now = Date.now();
    const last = notifyTestLast.get(user.wallet) ?? 0;
    if (now - last < 30_000) {
      res.status(429).json({ error: "Rate limited: try again in 30 seconds" });
      return;
    }
    notifyTestLast.set(user.wallet, now);
    const row = getUserByWallet(getDb(), user.wallet);
    if (!row) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (!row.email_enabled) {
      res.status(400).json({ error: "Email is disabled" });
      return;
    }
    try {
      const alert = { title: "Test email from SpendGuard", message: "This is a test alert email.", type: "POLICY_RESUMED", severity: row.min_severity as string, policy: "test", txSignature: null, createdAt: new Date().toISOString(), data: {} } as unknown as Parameters<typeof buildAlertEmail>[0];
      const { subject, html } = buildAlertEmail(alert);
      await sendEmail(row.email, subject, html);
      res.json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(502).json({ error: msg });
    }
  }));

  // ---------------------------------------------------------------- fallbacks

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    // Malformed JSON from express.json() carries a `body` property.
    if (err instanceof SyntaxError && "body" in err) {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }

    const message = err instanceof Error ? err.message : String(err);
    console.error(`[server] ${req.method} ${req.path} failed: ${sanitizeMessage(message)}`);
    if (res.headersSent) {
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

export function startServer(): void {
  const config = loadConfig();

  // Create backend/data/spendguard.db and every table before the first request.
  initDb();
  // Warm the cached service wallets so the first /services call is instant.
  loadServices();

  // Start the watcher asynchronously: its backfill runs at startup, and a
  // watcher failure must never stop the HTTP API from serving requests.
  let stopWatcher: (() => Promise<void>) | undefined;
  void startWatcher()
    .then((handle) => {
      stopWatcher = handle.stop;
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[server] watcher failed to start: ${sanitizeMessage(message)}`);
    });

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`SpendGuard backend listening on http://localhost:${config.port}`);
    console.log(`  CORS origin: ${config.frontendOrigin}`);
    console.log(`  RPC: ${getRpcHostname()} (devnet/localnet only)`);
    console.log(`  Program: ${config.programId.toBase58()}`);
    console.log(`  Policy: ${config.policyAddress ?? "not configured (POLICY_ADDRESS is empty)"}`);
  });

  const shutdown = (signal: string): void => {
    console.log(`\n${signal} received, shutting down`);
    const close = (): void => {
      server.close(() => {
        closeDb();
        process.exit(0);
      });
    };
    if (stopWatcher !== undefined) {
      void stopWatcher().finally(close);
    } else {
      close();
    }
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

// Only listen when run directly (`yarn dev` / `yarn start`); createApp() stays importable.
if (require.main === module) {
  startServer();
}
