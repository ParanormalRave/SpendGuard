import path from "node:path";
import { Keypair } from "@solana/web3.js";
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

/**
 * The four mock services: three on the allowlist plus `rogue-service`.
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
