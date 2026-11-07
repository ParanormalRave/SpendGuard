import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Keypair } from "@solana/web3.js";

const cache = new Map<string, Keypair>();

/**
 * Loads a Solana keypair from a `solana-keygen` JSON file (an array of 64
 * bytes). Results are cached by absolute path because the agent signs one
 * transaction per payment.
 *
 * Never logs or returns key material beyond the Keypair itself; error messages
 * only mention the path.
 */
export function loadKeypair(keypairPath: string): Keypair {
  if (keypairPath.trim().length === 0) {
    throw new Error("Keypair path is empty");
  }

  const resolvedPath = path.resolve(expandHome(keypairPath));
  const cached = cache.get(resolvedPath);
  if (cached !== undefined) {
    return cached;
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Keypair not found at ${resolvedPath}. Create one with:\n` +
        `  solana-keygen new --no-bip39-passphrase -o ${resolvedPath}`,
    );
  }

  const keypair = parseKeypairFile(resolvedPath);
  cache.set(resolvedPath, keypair);
  return keypair;
}

function expandHome(filePath: string): string {
  if (filePath === "~") {
    return os.homedir();
  }
  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

function parseKeypairFile(resolvedPath: string): Keypair {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  } catch {
    throw new Error(`Keypair at ${resolvedPath} is not valid JSON`);
  }

  if (!Array.isArray(parsed) || parsed.length !== 64 || !parsed.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    throw new Error(`Keypair at ${resolvedPath} must be a JSON array of 64 bytes`);
  }

  try {
    return Keypair.fromSecretKey(Uint8Array.from(parsed as number[]));
  } catch {
    throw new Error(`Keypair at ${resolvedPath} is not a valid ed25519 secret key`);
  }
}
