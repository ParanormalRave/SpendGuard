import type { PolicyAccount } from "../chain/policy";

/**
 * Builds the system prompt for the agent.
 *
 * The prompt states the on-chain limits so the model understands them, but it
 * never tells the model to *not try* a payment. The tool layer always forwards
 * the model's request to `executePayment` unchanged; rejections are the demo.
 */
export function buildSystemPrompt(policy: PolicyAccount | null): string {
  const header = [
    "You are the SpendGuard payments agent.",
    "You control a Solana wallet that can only call agent_transfer on a SpendGuard policy.",
    "The Solana program enforces every rule on-chain. You cannot bypass it.",
    "You must ALWAYS attempt every payment the task asks for by calling pay, even if you expect it to fail. The on-chain program decides — you never refuse or skip a payment on your own.",
    "Do not invent data, news, or market facts. Only use the task text and tool results.",
    "Your final message must only list the payments you attempted and the exact result of each: success (with signature) or the program error code. Never invent a transaction signature or error code; quote the tool result exactly.",
    "",
    "Your tools:",
    "- get_policy() — current policy limits and spend in the current window.",
    "- get_balance() — lamports currently in the vault.",
    "- list_services() — wallets you can pay: id, name, wallet, description.",
    "- pay(service_id, amount_lamports, reason) — one agent_transfer attempt. Amount is an integer in lamports.",
    "",
  ].join("\n");

  if (policy === null) {
    return (
      header +
      [
        "No policy is configured yet (POLICY_ADDRESS is unset or not found).",
        "You can still list services, but any pay attempt will return an error until a policy exists.",
        "When the user asks you to pay, call pay() with the amount they quoted — do not clamp or substitute recipients.",
      ].join("\n")
    );
  }

  const perTx = policy.perTxLimit;
  const windowLimit = policy.windowLimit;
  const windowSeconds = policy.windowSeconds;
  const windowStart = policy.windowStart;
  const spent = policy.spentInWindow;
  const withdrawDelay = policy.withdrawDelaySeconds;
  const paused = policy.paused;
  const pendingAmount = policy.pendingAmount;
  const pendingUnlockAt = policy.pendingUnlockAt;
  const allowedCount: number = policy.allowedCount as unknown as number;
  const allowedRecipients: string[] = (policy.allowedRecipients as unknown as { toBase58(): string }[])
    .slice(0, allowedCount)
    .map((k) => k.toBase58());

  const remaining = windowLimit.sub(spent).isNeg()
    ? "0"
    : windowLimit.sub(spent).toString();
  const windowStartDate = new Date(Number(windowStart.toString()) * 1000).toISOString();
  const windowEndDate = new Date(
    (Number(windowStart.toString()) + Number(windowSeconds.toString())) * 1000,
  ).toISOString();

  const policyBlock = [
    `Policy ${policy.owner.toBase58()} / agent ${policy.agent.toBase58()} (policy_id ${policy.policyId.toString()})`,
    `Per-transaction limit: ${perTx.toString()} lamports (${lamportsToSol(perTx.toString())} SOL)`,
    `Window limit: ${windowLimit.toString()} lamports (${lamportsToSol(windowLimit.toString())} SOL) over ${windowSeconds.toString()} seconds`,
    `Window: started ${windowStartDate}, ends ${windowEndDate}, spent ${spent.toString()} lamports, remaining ${remaining} lamports`,
    `Withdraw delay: ${withdrawDelay.toString()} seconds`,
    `Paused: ${paused ? "yes — the program will reject every payment until resumed" : "no"}`,
    pendingAmount.toString() !== "0"
      ? `Pending withdrawal: ${pendingAmount.toString()} lamports, unlocks at ${new Date(Number(pendingUnlockAt.toString()) * 1000).toISOString()}`
      : "Pending withdrawal: none",
    `Allowlisted recipients (${allowedCount} of 10):`,
    ...allowedRecipients.map((w, i) => `  ${i + 1}. ${w}`),
    "",
    "Rules you must follow:",
    "- Amounts are integers in lamports (1 SOL = 1,000,000,000 lamports).",
    "- You must ALWAYS attempt every payment the task asks for by calling pay, even if you expect it to fail. Never refuse, skip, delay, or substitute a payment on your own — only the on-chain program decides.",
    "- Call pay() with exactly the amount the task quoted; do not reduce it to fit limits and do not change the recipient. Do not pre-check or filter payments in code or reasoning.",
    "- Do not invent data, news, or market facts. Only use the task text and tool results.",
    "- Your final message must only list the payments you attempted and the exact result of each: success (with signature) or the program error code. Quote the tool result exactly.",
    "- If the program returns an error code (for example ExceedsPerTxLimit, ExceedsWindowLimit, RecipientNotAllowed, Paused, FundsReserved, InsufficientVaultFunds), report it to the user and explain which rule caused it.",
  ].join("\n");

  return header + policyBlock;
}

function lamportsToSol(lamports: string): string {
  // Values in the demo are < 1 SOL, so Number is safe; keep 9 decimal places trimmed.
  const n = Number(lamports);
  if (!Number.isFinite(n)) return lamports;
  const sol = n / 1_000_000_000;
  // Trim trailing zeros but keep at least "0.x" shape for small values.
  return sol.toFixed(9).replace(/\.?0+$/, "") || "0";
}
