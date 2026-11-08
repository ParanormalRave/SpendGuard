import BN from "bn.js";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { AnchorError } from "@anchor-lang/core";
import { getProgram } from "../chain/program";
import { deriveVaultPda } from "../chain/pdas";

export type PaymentStatus = "success" | "rejected" | "error";

export interface PaymentResult {
  status: PaymentStatus;
  signature: string | null;
  errorCode: string | null;
}

const U64_MAX = new BN("18446744073709551615"); // 2^64 - 1

/**
 * Validates that amount is a safe positive integer within u64 range.
 * Returns { valid: false, code: "InvalidAmount" } if invalid.
 */
function validateAmount(amount: unknown): { valid: true } | { valid: false; code: string } {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return { valid: false, code: "InvalidAmount" };
  }
  if (!Number.isSafeInteger(amount)) {
    return { valid: false, code: "InvalidAmount" };
  }
  if (amount <= 0) {
    return { valid: false, code: "InvalidAmount" };
  }
  // Check against u64 max
  const bnAmount = new BN(amount);
  if (bnAmount.gt(U64_MAX)) {
    return { valid: false, code: "InvalidAmount" };
  }
  return { valid: true };
}

/**
 * Sends an agent_transfer and lets the program decide.
 * No pre-checks on limits/allowlist — hard rule 3.
 */
export async function executePayment(
  policy: PublicKey,
  recipient: PublicKey,
  amountLamports: number,
): Promise<PaymentResult> {
  // Validate input before sending
  const validation = validateAmount(amountLamports);
  if (!validation.valid) {
    return { status: "error", signature: null, errorCode: validation.code };
  }

  const vault = deriveVaultPda(policy).address;
  const program = getProgram();
  const agent = program.provider.wallet?.publicKey;
  if (!agent) {
    return { status: "error", signature: null, errorCode: "InvalidAmount" };
  }

  try {
    const sig = await program
      .methods.agentTransfer(new BN(amountLamports))
      .accountsPartial({
        policy,
        vault,
        recipient,
        agent,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return { status: "success", signature: sig, errorCode: null };
  } catch (err: unknown) {
    const code = parseProgramError(err);
    if (code !== null) {
      // Rejected by program — extract sig if available
      const sig = extractSignature(err);
      return { status: "rejected", signature: sig, errorCode: code };
    }
    return { status: "error", signature: null, errorCode: null };
  }
}

/**
 * Extracts Anchor error code string (e.g. "ExceedsPerTxLimit") or null.
 * Checks multiple formats: direct AnchorError, nested objects, and log messages.
 */
export function parseProgramError(err: unknown): string | null {
  // Direct AnchorError
  if (err instanceof AnchorError) {
    return err.error.errorCode.code;
  }

  // Check nested error structure (SendTransactionError wrapped)
  if (err !== null && typeof err === "object") {
    const e = err as Record<string, unknown>;

    // Check for nested errorCode
    if ("error" in e && e.error !== null && typeof e.error === "object") {
      const inner = e.error as Record<string, unknown>;
      if ("errorCode" in inner && inner.errorCode !== null && typeof inner.errorCode === "object") {
        const code = (inner.errorCode as Record<string, unknown>).code;
        if (typeof code === "string") return code;
      }
    }

    // Check logs for "Error Code: <code>" pattern
    if ("logs" in e && Array.isArray(e.logs)) {
      for (const log of e.logs) {
        if (typeof log === "string") {
          const match = log.match(/Error Code:\s*(\w+)/);
          if (match) return match[1]!;
        }
      }
    }

    // Check message for error code pattern
    if ("message" in e && typeof e.message === "string") {
      const match = e.message.match(/Error Code:\s*(\w+)/);
      if (match) return match[1]!;
    }
  }

  return null;
}

function extractSignature(err: unknown): string | null {
  if (err !== null && typeof err === "object") {
    const e = err as Record<string, unknown>;

    // Check direct signature property
    if ("signature" in e && typeof e.signature === "string") {
      return e.signature;
    }

    // Check logs for signature
    if ("logs" in e && Array.isArray(e.logs)) {
      for (const log of e.logs) {
        if (typeof log === "string") {
          const match = log.match(/signature:\s*([A-Za-z0-9=]+)/);
          if (match) return match[1]!;
        }
      }
    }

    // Check message for signature
    if ("message" in e && typeof e.message === "string") {
      const match = e.message.match(/signature:\s*([A-Za-z0-9=]+)/);
      if (match) return match[1]!;
    }
  }

  return null;
}
