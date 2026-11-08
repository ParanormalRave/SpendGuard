import { PublicKey } from "@solana/web3.js";
import { loadConfig } from "../config";
import { fetchPolicy, getVaultBalance } from "../chain";
import { executePayment } from "../payments";
import { initDb, logAttempt, readAttempts } from "../db";

async function main(): Promise<void> {
  // Ensure backend/data/spendguard.db and all tables exist before any logging.
  const db = initDb();

  const config = loadConfig();
  if (!config.policyAddress) throw new Error("POLICY_ADDRESS not set in .env");

  const policyAddr = new PublicKey(config.policyAddress);
  const policy = await fetchPolicy(policyAddr);
  const vaultBalance = await getVaultBalance(policyAddr);

  const recipients = policy.allowedRecipients.slice(0, policy.allowedCount);
  if (recipients.length === 0) throw new Error("No allowed recipients on policy");
  const recipient = recipients[0]!;
  const perTxLimit = policy.perTxLimit; // BN

  console.log(`Policy: ${policyAddr.toBase58()}`);
  console.log(`Vault balance: ${vaultBalance} lamports`);
  console.log(`Per-tx limit: ${perTxLimit.toString()} lamports`);
  console.log(`Recipient: ${recipient.toBase58()}`);

  if (vaultBalance === 0) {
    console.warn("Warning: vault balance is 0 — payments will fail with InsufficientVaultFunds. Fund the vault first (deposit).");
  }

  function record(
    scenario: string,
    recipientAddr: string,
    amountLamports: number,
    reason: string,
    result: Awaited<ReturnType<typeof executePayment>>,
  ): void {
    logAttempt(db, {
      timestamp: Date.now(),
      scenario,
      policy: policyAddr.toBase58(),
      recipient: recipientAddr,
      service_id: null,
      amount_lamports: amountLamports,
      reason,
      status: result.status,
      error_code: result.errorCode,
      signature: result.signature,
    });
  }

  function recordThrow(
    scenario: string,
    recipientAddr: string,
    amountLamports: number,
    reason: string,
  ): void {
    logAttempt(db, {
      timestamp: Date.now(),
      scenario,
      policy: policyAddr.toBase58(),
      recipient: recipientAddr,
      service_id: null,
      amount_lamports: amountLamports,
      reason,
      status: "error",
      error_code: null,
      signature: null,
    });
  }

  // --- 1) Allowed payment: half the limit ---
  const okAmount = perTxLimit.divn(2);
  const okLamports = okAmount.toNumber();
  console.log(`\n1) Allowed payment: ${okAmount.toString()} lamports`);
  let r1: Awaited<ReturnType<typeof executePayment>>;
  try {
    r1 = await executePayment(policyAddr, recipient, okLamports);
    console.log(JSON.stringify(r1, null, 2));
    record("testPayments-allowed", recipient.toBase58(), okLamports, "test: half perTxLimit should succeed", r1);
  } catch (err: unknown) {
    console.error("executePayment threw:", err instanceof Error ? err.message : String(err));
    recordThrow("testPayments-allowed", recipient.toBase58(), okLamports, "test: half perTxLimit should succeed");
    throw err;
  }

  // --- 2) Over-limit payment: perTxLimit + 1 (expect rejected/ExceedsPerTxLimit) ---
  const badAmount = perTxLimit.addn(1);
  const badLamports = badAmount.toNumber();
  console.log(`\n2) Over-limit payment: ${badAmount.toString()} lamports`);
  let r2: Awaited<ReturnType<typeof executePayment>>;
  try {
    r2 = await executePayment(policyAddr, recipient, badLamports);
    console.log(JSON.stringify(r2, null, 2));
    record("testPayments-overLimit", recipient.toBase58(), badLamports, "test: perTxLimit+1 should be rejected", r2);
  } catch (err: unknown) {
    console.error("executePayment threw:", err instanceof Error ? err.message : String(err));
    recordThrow("testPayments-overLimit", recipient.toBase58(), badLamports, "test: perTxLimit+1 should be rejected");
    throw err;
  }

  console.log("\nRecent attempts (from SQLite):");
  const recent = readAttempts(db, 5);
  for (const a of recent) {
    console.log(`  #${a.id} ${a.scenario} ${a.status} ${a.error_code ?? ""} sig=${a.signature ?? "null"}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
