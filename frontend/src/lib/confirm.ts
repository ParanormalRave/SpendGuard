import { Connection } from "@solana/web3.js";
import { explainError } from "./errors";

const POLL_MS = 2_000;
const TIMEOUT_MS = 90_000;
const EXPLORER_TX = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function extractCode(err: unknown): string | null {
  const msg = typeof err === "string" ? err : JSON.stringify(err ?? "");
  const codes = [
    "Unauthorized",
    "Paused",
    "InvalidAmount",
    "ExceedsPerTxLimit",
    "ExceedsWindowLimit",
    "RecipientNotAllowed",
    "InsufficientVaultFunds",
    "FundsReserved",
    "InvalidPolicyConfig",
    "RecipientListFull",
    "DuplicateRecipient",
    "InvalidRecipient",
    "WithdrawalAlreadyPending",
    "NoPendingWithdrawal",
    "WithdrawalNotReady",
    "VaultNotEmpty",
  ];
  for (const c of codes) if (msg.includes(c)) return c;
  return null;
}

/** Poll until confirmed/finalized, error, or expiry. Throws on failure/timeout. */
export async function confirmSignature(
  conn: Connection,
  signature: string,
  lastValidBlockHeight?: number,
): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (lastValidBlockHeight !== undefined) {
      try {
        const height = await conn.getBlockHeight("confirmed");
        if (height > lastValidBlockHeight) break;
      } catch {
        // ignore, keep polling until wall timeout
      }
    }
    let statuses: Awaited<ReturnType<Connection["getSignatureStatuses"]>>;
    try {
      statuses = await conn.getSignatureStatuses([signature], { searchTransactionHistory: true });
    } catch {
      if (Date.now() + POLL_MS >= deadline) break;
      await sleep(POLL_MS);
      continue;
    }
    const s = statuses.value[0];
    if (s) {
      if (s.err) {
        const code = extractCode(s.err);
        throw new Error(
          `${explainError(code)} (${JSON.stringify(s.err)}) signature=${signature} ${EXPLORER_TX(signature)}`,
        );
      }
      if (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized") return;
    }
    if (Date.now() + POLL_MS >= deadline) break;
    await sleep(POLL_MS);
  }
  throw new Error(
    `We could not confirm the transaction. It may have failed or expired. Check the signature on Solana Explorer before trying again signature=${signature} ${EXPLORER_TX(signature)}`,
  );
}
