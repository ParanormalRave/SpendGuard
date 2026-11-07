import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";
import { loadConfig } from "../config";
import { deriveVaultPda, fetchPolicy, getRpcHostname, getVaultBalance } from "../chain";

const LAMPORTS_PER_SOL = new BN(1_000_000_000);
const LABEL_WIDTH = 17;

async function main(): Promise<void> {
  const config = loadConfig();
  const rawAddress = process.argv[2] ?? config.policyAddress;

  if (rawAddress === undefined || rawAddress.trim().length === 0) {
    throw new Error(
      "Usage: yarn print:policy <policy-address>\n" +
        "       (or set POLICY_ADDRESS in backend/.env)",
    );
  }

  const address = parseAddress(rawAddress);
  const [policy, vaultBalance] = await Promise.all([fetchPolicy(address), getVaultBalance(address)]);
  const vault = deriveVaultPda(address).address;
  const now = Math.floor(Date.now() / 1000);
  const windowEnd = policy.windowStart.add(policy.windowSeconds);

  const lines: string[] = [];
  const section = (title: string): void => {
    lines.push("", title);
  };
  const field = (label: string, value: string): void => {
    lines.push(`  ${label.padEnd(LABEL_WIDTH)}${value}`);
  };
  const amount = (lamports: BN | number): string =>
    `${formatSol(lamports)} SOL   (${formatLamports(lamports)} lamports)`;

  lines.push(`program   ${config.programId.toBase58()}   (${getRpcHostname()})`);
  lines.push(`policy    ${address.toBase58()}`);

  section("Identity");
  field("owner", policy.owner.toBase58());
  field("agent", policy.agent.toBase58());
  field("policy id", policy.policyId.toString());

  section("Limits (immutable)");
  field("per transaction", amount(policy.perTxLimit));
  field("per window", amount(policy.windowLimit));
  field("window length", `${policy.windowSeconds.toString()}s`);
  field("withdraw delay", `${policy.withdrawDelaySeconds.toString()}s`);

  section("Window");
  field("started", formatTimestamp(policy.windowStart));
  field("spent", `${amount(policy.spentInWindow)}   ${formatPercent(policy.spentInWindow, policy.windowLimit)}% of limit`);
  field("remaining", amount(policy.windowLimit.sub(policy.spentInWindow)));
  field(
    "resets",
    isPast(windowEnd, now)
      ? `window elapsed at ${formatTimestamp(windowEnd)}; the next payment starts a new one`
      : `${formatCountdown(windowEnd, now)} (${formatTimestamp(windowEnd)})`,
  );

  section("State");
  field("paused", policy.paused ? "YES" : "no");

  const recipientCount = Math.min(policy.allowedCount, policy.allowedRecipients.length);
  field("recipients", `${recipientCount} of ${policy.allowedRecipients.length}`);
  for (let index = 0; index < recipientCount; index += 1) {
    lines.push(`    ${String(index + 1).padStart(2)}. ${policy.allowedRecipients[index].toBase58()}`);
  }

  section(`Vault  ${vault.toBase58()}`);
  field("balance", vaultBalance === 0 ? "0 SOL   (no vault account: never deposited, or drained)" : amount(vaultBalance));

  section("Withdrawal");
  if (policy.pendingAmount.isZero()) {
    field("pending", "none");
  } else {
    field("amount", amount(policy.pendingAmount));
    field("unlocks at", formatTimestamp(policy.pendingUnlockAt));
    field(
      "status",
      isPast(policy.pendingUnlockAt, now)
        ? "ready — anyone can call execute_withdraw"
        : `locked, ${formatCountdown(policy.pendingUnlockAt, now)} to go`,
    );
  }

  console.log(lines.join("\n"));
}

function parseAddress(raw: string): PublicKey {
  try {
    return new PublicKey(raw.trim());
  } catch {
    throw new Error(`"${raw}" is not a valid Solana public key`);
  }
}

/** Lamports -> SOL string. Integer BN maths only: floats would lose lamports. */
function formatSol(lamports: BN | number): string {
  const value = BN.isBN(lamports) ? lamports : new BN(lamports);
  const absolute = value.abs();
  const whole = absolute.div(LAMPORTS_PER_SOL).toString();
  const fraction = absolute.mod(LAMPORTS_PER_SOL).toString().padStart(9, "0").replace(/0+$/, "");
  return `${value.isNeg() ? "-" : ""}${whole}${fraction.length > 0 ? `.${fraction}` : ""}`;
}

function formatLamports(lamports: BN | number): string {
  const value = BN.isBN(lamports) ? lamports.toString() : String(lamports);
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Percentage with two decimals, by integer cross-multiplication (no floats). */
function formatPercent(part: BN, total: BN): string {
  if (total.isZero()) {
    return "0.00";
  }
  const hundredths = part.mul(new BN(10_000)).div(total);
  return `${hundredths.div(new BN(100)).toString()}.${hundredths.mod(new BN(100)).toString().padStart(2, "0")}`;
}

function formatTimestamp(unixSeconds: BN): string {
  return new Date(Number(unixSeconds.toString()) * 1000).toISOString();
}

function isPast(target: BN, nowSeconds: number): boolean {
  return Number(target.toString()) <= nowSeconds;
}

/**
 * Countdown from the local clock. The validator clock can drift from wall
 * time, so this is a hint, not the authority: the program compares against
 * its own Clock.
 */
function formatCountdown(target: BN, nowSeconds: number): string {
  const remaining = Number(target.toString()) - nowSeconds;
  return remaining <= 0 ? "ready now" : `in ${formatDuration(remaining)}`;
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (parts.length === 0 || rest > 0) parts.push(`${rest}s`);
  return parts.join(" ");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
