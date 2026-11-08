// Browser-visible configuration.
//
// NEXT_PUBLIC_* values are inlined into the bundle at build time, so they are
// read statically here (never destructured from process.env, or the inlining
// breaks). Nothing secret belongs in this file: everything here ships to the
// browser.

const DEVNET_RPC = "https://api.devnet.solana.com";
const LOCAL_BACKEND = "http://localhost:3001";

/** Solana RPC endpoint. Devnet or localnet only. */
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL?.trim() || DEVNET_RPC;

/** Deployed SpendGuard program (must match contracts/Anchor.toml and the IDL). */
export const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID?.trim() ?? "";

/** SpendGuard backend HTTP API, without a trailing slash. */
export const BACKEND_URL = (
  process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || LOCAL_BACKEND
).replace(/\/+$/, "");

/** Google OAuth client ID for Sign in with Google */
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";

// Hard rule: SpendGuard never talks to mainnet. Fail loudly at load instead of
// silently pointing the dashboard at real funds.
if (/mainnet/i.test(RPC_URL)) {
  throw new Error(
    `NEXT_PUBLIC_RPC_URL points at mainnet (${RPC_URL}). SpendGuard is devnet only.`,
  );
}
