import { PublicKey } from "@solana/web3.js";
import { loadConfig } from "../config";
import { fetchPolicy, getVaultBalance } from "../chain/policy";
import { executePayment } from "../payments";
import { getDb, logAttempt } from "../db";
import { findService, loadServices } from "./services";

/** One row in the attempt log that the tool loop collects. */
export interface AgentAttempt {
  serviceId: string | null;
  recipient: string;
  amountLamports: number;
  reason: string | null;
  status: "success" | "rejected" | "error";
  errorCode: string | null;
  signature: string | null;
}

/** Result returned to the model from a tool call. */
export interface ToolCallResult {
  content: string;
  isError: boolean;
  attempt?: AgentAttempt;
}

// The SDK's Tool type lives in a deep import not exported by the package.
// Use a local structural type that matches {name, description, input_schema}.
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export const TOOL_DEFS: ToolDefinition[] = [
  {
    name: "get_policy",
    description:
      "Returns the SpendGuard policy's on-chain limits, window spend, paused flag, pending withdrawal, and allowlist. No arguments.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "get_balance",
    description:
      "Returns the vault balance in lamports (and SOL) for the current policy. No arguments.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "list_services",
    description:
      "Lists the mock services the agent can pay, each with id, name, wallet (base58), and description. Three are allowlisted, rogue-service is not. No arguments.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "pay",
    description:
      "Attempts one agent_transfer to a service. Always submits the transaction; the program decides. Returns success with a signature or a program error code.",
    input_schema: {
      type: "object",
      properties: {
        service_id: {
          type: "string",
          description: "Service id from list_services, for example data-api or rogue-service",
        },
        amount_lamports: {
          type: "integer",
          description: "Amount in lamports as an integer (1 SOL = 1,000,000,000 lamports)",
        },
        reason: {
          type: "string",
          description: "Human-readable reason for the payment, shown in the activity log",
        },
      },
      required: ["service_id", "amount_lamports", "reason"],
      additionalProperties: false,
    },
  },
];

export async function toolGetPolicy(): Promise<ToolCallResult> {
  const config = loadConfig();
  if (!config.policyAddress) {
    return {
      content: JSON.stringify({ error: "NoPolicyConfigured", message: "POLICY_ADDRESS is not set" }),
      isError: true,
    };
  }
  try {
    const policy = await fetchPolicy(config.policyAddress);
    const allowedCount = policy.allowedCount as unknown as number;
    const allowed = (policy.allowedRecipients as unknown as { toBase58(): string }[])
      .slice(0, allowedCount)
      .map((k) => k.toBase58());
    const payload = {
      policy: config.policyAddress,
      owner: policy.owner.toBase58(),
      agent: policy.agent.toBase58(),
      policyId: policy.policyId.toString(),
      perTxLimit: policy.perTxLimit.toString(),
      windowLimit: policy.windowLimit.toString(),
      windowSeconds: policy.windowSeconds.toString(),
      windowStart: policy.windowStart.toString(),
      spentInWindow: policy.spentInWindow.toString(),
      withdrawDelaySeconds: policy.withdrawDelaySeconds.toString(),
      paused: policy.paused,
      pendingAmount: policy.pendingAmount.toString(),
      pendingUnlockAt: policy.pendingUnlockAt.toString(),
      allowedRecipients: allowed,
      allowedCount,
    };
    return { content: JSON.stringify(payload), isError: false };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: JSON.stringify({ error: "FetchPolicyFailed", message }), isError: true };
  }
}

export async function toolGetBalance(): Promise<ToolCallResult> {
  const config = loadConfig();
  if (!config.policyAddress) {
    return {
      content: JSON.stringify({ error: "NoPolicyConfigured", message: "POLICY_ADDRESS is not set" }),
      isError: true,
    };
  }
  try {
    const lamports = await getVaultBalance(config.policyAddress);
    return {
      content: JSON.stringify({ lamports, sol: lamports / 1_000_000_000 }),
      isError: false,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: JSON.stringify({ error: "GetBalanceFailed", message }), isError: true };
  }
}

export async function toolListServices(): Promise<ToolCallResult> {
  const services = loadServices();
  return { content: JSON.stringify(services), isError: false };
}

/**
 * Attempts a payment for exactly what the model asked for.
 *
 * No filtering: the amount and recipient are forwarded to `executePayment`
 * unchanged. The program error code is returned as the tool result.
 *
 * `scenario` is an internal label for the attempt log; callers outside the
 * agent (tests) can omit it and it defaults to "manual".
 */
export async function toolPay(
  serviceId: string,
  amountLamports: number,
  reason: string,
  scenario?: string,
): Promise<ToolCallResult> {
  // Ensure the DB exists before any logAttempt.
  try {
    getDb();
  } catch {
    // getDb throws only on unrecoverable FS errors; let logAttempt surface it.
  }

  const config = loadConfig();
  const policyAddress = config.policyAddress ?? "unknown-policy";
  const timestamp = Date.now();
  const scenarioLabel = scenario ?? "manual";

  // Normalise amount: the model may send a string or float; keep integer lamports.
  let amount = amountLamports;
  if (typeof amount === "string") {
    const parsed = Number(amount);
    if (Number.isFinite(parsed)) amount = parsed;
  }
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    amount = NaN;
  } else {
    amount = Math.trunc(amount);
  }

  const service = findService(serviceId);

  if (service === undefined) {
    const attempt: AgentAttempt = {
      serviceId,
      recipient: "",
      amountLamports: Number.isFinite(amount) ? (amount as number) : 0,
      reason: reason ?? null,
      status: "error",
      errorCode: "UnknownService",
      signature: null,
    };
    try {
      logAttempt(getDb(), {
        timestamp,
        scenario: scenarioLabel,
        policy: policyAddress,
        recipient: "",
        service_id: serviceId,
        amount_lamports: attempt.amountLamports,
        reason: reason ?? null,
        status: "error",
        error_code: "UnknownService",
        signature: null,
      });
    } catch {
      // Logging must not hide the tool result from the model.
    }
    return {
      content: JSON.stringify({
        status: "error",
        errorCode: "UnknownService",
        message: `Unknown service_id "${serviceId}". Available: ${loadServices().map((s) => s.id).join(", ")}`,
        serviceId,
        amountLamports: attempt.amountLamports,
      }),
      isError: true,
      attempt,
    };
  }

  // Policy must be configured to send a transaction.
  if (!config.policyAddress) {
    const attempt: AgentAttempt = {
      serviceId,
      recipient: service.wallet,
      amountLamports: Number.isFinite(amount) ? (amount as number) : 0,
      reason: reason ?? null,
      status: "error",
      errorCode: "NoPolicyConfigured",
      signature: null,
    };
    try {
      logAttempt(getDb(), {
        timestamp,
        scenario: scenarioLabel,
        policy: policyAddress,
        recipient: service.wallet,
        service_id: serviceId,
        amount_lamports: attempt.amountLamports,
        reason: reason ?? null,
        status: "error",
        error_code: "NoPolicyConfigured",
        signature: null,
      });
    } catch {
      // ignore
    }
    return {
      content: JSON.stringify({
        status: "error",
        errorCode: "NoPolicyConfigured",
        message: "POLICY_ADDRESS is not set; cannot send agent_transfer",
        serviceId,
        recipient: service.wallet,
        amountLamports: attempt.amountLamports,
      }),
      isError: true,
      attempt,
    };
  }

  let recipientPubkey: PublicKey;
  try {
    recipientPubkey = new PublicKey(service.wallet);
  } catch {
    const attempt: AgentAttempt = {
      serviceId,
      recipient: service.wallet,
      amountLamports: Number.isFinite(amount) ? (amount as number) : 0,
      reason: reason ?? null,
      status: "error",
      errorCode: "InvalidRecipient",
      signature: null,
    };
    try {
      logAttempt(getDb(), {
        timestamp,
        scenario: scenarioLabel,
        policy: policyAddress,
        recipient: service.wallet,
        service_id: serviceId,
        amount_lamports: attempt.amountLamports,
        reason: reason ?? null,
        status: "error",
        error_code: "InvalidRecipient",
        signature: null,
      });
    } catch {
      // ignore
    }
    return {
      content: JSON.stringify({ status: "error", errorCode: "InvalidRecipient", serviceId, recipient: service.wallet }),
      isError: true,
      attempt,
    };
  }

  let policyPubkey: PublicKey;
  try {
    policyPubkey = new PublicKey(config.policyAddress);
  } catch {
    const attempt: AgentAttempt = {
      serviceId,
      recipient: service.wallet,
      amountLamports: Number.isFinite(amount) ? (amount as number) : 0,
      reason: reason ?? null,
      status: "error",
      errorCode: "NoPolicyConfigured",
      signature: null,
    };
    try {
      logAttempt(getDb(), {
        timestamp,
        scenario: scenarioLabel,
        policy: policyAddress,
        recipient: service.wallet,
        service_id: serviceId,
        amount_lamports: attempt.amountLamports,
        reason: reason ?? null,
        status: "error",
        error_code: "NoPolicyConfigured",
        signature: null,
      });
    } catch {
      // ignore
    }
    return {
      content: JSON.stringify({ status: "error", errorCode: "NoPolicyConfigured", message: "POLICY_ADDRESS is not a valid pubkey" }),
      isError: true,
      attempt,
    };
  }

  // Hard rule: forward exactly what the model asked for, no limit/allowlist/paused checks.
  let result: Awaited<ReturnType<typeof executePayment>>;
  try {
    result = await executePayment(policyPubkey, recipientPubkey, amount as number);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const attemptOnThrow: AgentAttempt = {
      serviceId,
      recipient: service.wallet,
      amountLamports: Number.isFinite(amount) ? (amount as number) : 0,
      reason: reason ?? null,
      status: "error",
      errorCode: null,
      signature: null,
    };
    try {
      logAttempt(getDb(), {
        timestamp,
        scenario: scenarioLabel,
        policy: policyAddress,
        recipient: service.wallet,
        service_id: serviceId,
        amount_lamports: attemptOnThrow.amountLamports,
        reason: reason ?? null,
        status: "error",
        error_code: null,
        signature: null,
      });
    } catch {
      // Logging failure must not hide the on-chain outcome from the model.
    }
    return {
      content: JSON.stringify({
        status: "error" as const,
        errorCode: null,
        signature: null,
        serviceId,
        recipient: service.wallet,
        amountLamports: attemptOnThrow.amountLamports,
        message: `Payment threw before reaching the program: ${message}`,
      }),
      isError: true,
      attempt: attemptOnThrow,
    };
  }

  const attempt: AgentAttempt = {
    serviceId,
    recipient: service.wallet,
    amountLamports: Number.isFinite(amount) ? (amount as number) : 0,
    reason: reason ?? null,
    status: result.status,
    errorCode: result.errorCode,
    signature: result.signature,
  };

  try {
    logAttempt(getDb(), {
      timestamp,
      scenario: scenarioLabel,
      policy: policyAddress,
      recipient: service.wallet,
      service_id: serviceId,
      amount_lamports: attempt.amountLamports,
      reason: reason ?? null,
      status: result.status,
      error_code: result.errorCode,
      signature: result.signature,
    });
  } catch {
    // Logging failure must not hide the on-chain outcome from the model.
  }

  const isError = result.status !== "success";
  const payload =
    result.status === "success"
      ? {
          status: "success" as const,
          signature: result.signature,
          serviceId,
          recipient: service.wallet,
          amountLamports: attempt.amountLamports,
        }
      : {
          status: result.status,
          errorCode: result.errorCode,
          signature: result.signature,
          serviceId,
          recipient: service.wallet,
          amountLamports: attempt.amountLamports,
          message:
            result.errorCode !== null
              ? `Program rejected the payment: ${result.errorCode}`
              : "Payment failed before reaching the program",
        };

  return { content: JSON.stringify(payload), isError, attempt };
}
