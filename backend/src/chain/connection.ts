import { Connection } from "@solana/web3.js";
import { loadConfig } from "../config";

let sharedConnection: Connection | undefined;

/**
 * The process-wide Solana connection.
 *
 * A Connection owns websocket subscriptions, so the backend should share one
 * instead of constructing a new one per call. Cached after the first call,
 * which also means a later change to RPC_URL needs a restart.
 */
export function getConnection(): Connection {
  if (sharedConnection === undefined) {
    sharedConnection = new Connection(loadConfig().rpcUrl, "confirmed");
  }
  return sharedConnection;
}

/**
 * The RPC hostname, without path or query string, so it is safe to log and
 * show (provider URLs often embed an API key in the path).
 */
export function getRpcHostname(): string {
  try {
    return new URL(loadConfig().rpcUrl).hostname;
  } catch {
    return "unknown RPC";
  }
}
