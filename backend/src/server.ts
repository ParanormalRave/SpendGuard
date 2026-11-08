import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { PublicKey } from "@solana/web3.js";
import { loadConfig } from "./config";
import { getRpcHostname } from "./chain/connection";
import { fetchPolicy, getVaultBalance, type PolicyAccount } from "./chain/policy";
import { closeDb, getDb, initDb, readAttempts, readPayments } from "./db";
import { API_SCENARIOS, getScenarioTask, loadServices, runAgent } from "./agent";
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
  app.use(cors({ origin: config.frontendOrigin }));
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
        const reason =
          scenario === "unusual"
            ? 'Scenario "unusual" is implemented in M8'
            : `Unknown scenario "${scenario}". Supported: ${API_SCENARIOS.join(", ")}`;
        res.status(400).json({ error: reason });
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
        // Validate the scenario text before spending API tokens.
        getScenarioTask(scenario, task);
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
