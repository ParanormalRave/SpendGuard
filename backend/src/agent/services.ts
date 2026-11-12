import path from "node:path";
import { Keypair, PublicKey } from "@solana/web3.js";
import { loadKeypair } from "../chain/keypairs";

/**
 * A mock paid service the agent can buy from.
 *
 * `wallet` is a base58 address, never key material: the agent only needs the
 * destination of `agent_transfer`.
 */
export interface Service {
  id: string;
  name: string;
  wallet: string;
  description: string;
}

interface ServiceSpec {
  id: string;
  name: string;
  description: string;
  /**
   * Keypair file created by backend/scripts/setup-demo.ts. Using those files
   * keeps the wallets the agent pays identical to the ones the policy
   * allowlists; a freshly generated wallet would be rejected on-chain for the
   * wrong reason.
   */
  keyFile: string;
}

const SERVICE_SPECS: readonly ServiceSpec[] = [
  {
    id: "data-api",
    name: "Data API",
    description: "Token and market data endpoints, billed per request.",
    keyFile: "service-1-keypair.json",
  },
  {
    id: "compute-market",
    name: "Compute Market",
    description: "Pay-per-minute GPU compute for model inference and backtests.",
    keyFile: "service-2-keypair.json",
  },
  {
    id: "market-news",
    name: "Market News",
    description: "Curated news feed and sentiment summaries for markets.",
    keyFile: "service-3-keypair.json",
  },
  {
    id: "rogue-service",
    name: "Rogue Service",
    description:
      "Unverified vendor used by the prompt-injection demo. NOT allowlisted.",
    keyFile: "rogue-service-keypair.json",
  },
];

let cached: Service[] | undefined;

type EnvServiceInput = {
  id: unknown;
  name: unknown;
  wallet: unknown;
  description?: unknown;
};

function parseServiceWallets(raw: string): Service[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "SERVICE_WALLETS is not valid JSON. Expected a JSON array of { id, name, wallet } (public keys only).",
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error("SERVICE_WALLETS must be a JSON array of { id, name, wallet }");
  }
  if (parsed.length === 0) {
    throw new Error("SERVICE_WALLETS must be a non-empty array of { id, name, wallet }");
  }
  const seen = new Set<string>();
  return (parsed as EnvServiceInput[]).map((entry, i) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`SERVICE_WALLETS[${i}] must be an object with { id, name, wallet }`);
    }
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const wallet = typeof entry.wallet === "string" ? entry.wallet.trim() : "";
    const description = typeof entry.description === "string" ? entry.description : "";
    if (!id) throw new Error(`SERVICE_WALLETS[${i}].id is required`);
    if (!name) throw new Error(`SERVICE_WALLETS[${i}].name is required`);
    if (!wallet) throw new Error(`SERVICE_WALLETS[${i}].wallet is required`);
    if (seen.has(id)) throw new Error(`SERVICE_WALLETS has duplicate id "${id}"`);
    seen.add(id);
    try {
      new PublicKey(wallet);
    } catch {
      throw new Error(`SERVICE_WALLETS[${i}] wallet is not a valid Solana public key (id="${id}")`);
    }
    return { id, name, wallet, description };
  });
}

/**
 * The four mock services: three on the allowlist plus `rogue-service`.
 *
 * Precedence:
 * 1. If SERVICE_WALLETS is set, parse it as JSON array of { id, name, wallet[, description] }
 *    containing public keys only and use it verbatim (no file reads, no key generation).
 * 2. Else if NODE_ENV=production, throw — never generate random wallets in production.
 * 3. Else fall back to local behavior: read keys/ files, random wallet if missing.
 *
 * Wallets come from the keypairs `setup-demo.ts` generated. If a file is
 * missing (for example before setup has run) a throwaway wallet is used so the
 * tool loop still works; such a wallet is not on any allowlist, which is the
 * honest outcome — the program will reject the payment.
 */
export function loadServices(): Service[] {
  if (cached !== undefined) {
    return cached;
  }

  const raw = process.env.SERVICE_WALLETS?.trim();
  if (raw !== undefined && raw.length > 0) {
    cached = parseServiceWallets(raw);
    return cached;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SERVICE_WALLETS is required when NODE_ENV=production. Set it to a JSON array of { id, name, wallet } public keys. Random wallets are disabled in production.",
    );
  }

  const keysDir = path.resolve(__dirname, "../../keys");

  cached = SERVICE_SPECS.map((spec) => {
    let wallet: string;
    try {
      wallet = loadKeypair(path.join(keysDir, spec.keyFile)).publicKey.toBase58();
    } catch {
      // Setup has not run: fall back to a random wallet, never key material.
      wallet = Keypair.generate().publicKey.toBase58();
    }
    return {
      id: spec.id,
      name: spec.name,
      wallet,
      description: spec.description,
    };
  });

  return cached;
}

/** Looks up one service by id, or undefined when the model invented an id. */
export function findService(serviceId: string): Service | undefined {
  return loadServices().find((service) => service.id === serviceId);
}
