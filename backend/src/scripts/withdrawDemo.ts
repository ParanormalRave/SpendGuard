/**
 * Devnet helper: request or cancel a 0.01 SOL owner withdrawal.
 *
 * Usage (run from backend/ so dotenv finds backend/.env):
 *   yarn tsx src/scripts/withdrawDemo.ts          # request_withdraw(0.01 SOL)
 *   yarn tsx src/scripts/withdrawDemo.ts cancel   # cancel_withdraw
 *
 * Env: RPC_URL, PROGRAM_ID, POLICY_ADDRESS, OWNER_KEYPAIR_PATH.
 * Devnet only: aborts unless RPC_URL contains "devnet".
 * Never prints secret keys.
 */

import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";
import { loadConfig } from "../config";
import { createProgram } from "../chain/program";
import { getConnection, getRpcHostname } from "../chain/connection";
import { loadKeypair } from "../chain/keypairs";
import { deriveVaultPda } from "../chain/pdas";
import { fetchPolicy, getVaultBalance } from "../chain/policy";

/** 0.01 SOL in integer lamports (money is never floating point). */
const WITHDRAW_LAMPORTS = new BN(10_000_000);

type Action = "request" | "cancel";

function parseAction(argv: string[]): Action {
  if (argv.length === 0) return "request";
  if (argv.length === 1 && argv[0]!.toLowerCase() === "cancel") return "cancel";
  throw new Error(`Unknown arguments: ${argv.join(" ")}. Usage: withdrawDemo.ts [cancel]`);
}

async function main(): Promise<void> {
  const action = parseAction(process.argv.slice(2));
  const config = loadConfig();

  // Hard rule: devnet only. Checked before any key is loaded or tx is sent.
  if (!/devnet/i.test(config.rpcUrl)) {
    console.error(`Abort: RPC_URL must contain "devnet" (host: ${getRpcHostname()}).`);
    console.error("SpendGuard never touches mainnet.");
    process.exit(1);
  }

  if (!config.policyAddress) {
    throw new Error("POLICY_ADDRESS is not set in backend/.env");
  }

  const ownerPath = process.env["OWNER_KEYPAIR_PATH"]?.trim();
  if (!ownerPath) {
    throw new Error("OWNER_KEYPAIR_PATH is not set in backend/.env");
  }

  // loadKeypair expands "~" and never logs or returns key material.
  const owner = loadKeypair(ownerPath);
  const connection = getConnection();
  const policyAddress = new PublicKey(config.policyAddress);
  const vaultAddress = deriveVaultPda(policyAddress).address;

  // Fail early with a clear message when POLICY_ADDRESS is wrong.
  const policy = await fetchPolicy(policyAddress);
  const vaultBalance = await getVaultBalance(policyAddress);
  const pendingUnlockAt = policy.pendingUnlockAt.toNumber();

  console.log(`RPC:    ${getRpcHostname()} (devnet)`);
  console.log(`Owner:  ${owner.publicKey.toBase58()}`);
  console.log(`Policy: ${policyAddress.toBase58()}`);
  console.log(`Vault:  ${vaultAddress.toBase58()} (${vaultBalance} lamports)`);
  console.log(
    `Pending: ${policy.pendingAmount.toString()} lamports, ` +
      (pendingUnlockAt === 0 ? "none" : `unlocks ${new Date(pendingUnlockAt * 1000).toISOString()}`),
  );

  const program = createProgram(owner, connection);

  let signature: string;
  if (action === "cancel") {
    console.log("\nCalling cancel_withdraw...");
    signature = await program.methods
      .cancelWithdraw()
      .accountsPartial({ owner: owner.publicKey, policy: policyAddress })
      .signers([owner])
      .rpc({ commitment: "confirmed" });
  } else {
    console.log(
      `\nCalling request_withdraw for 0.01 SOL (${WITHDRAW_LAMPORTS.toString()} lamports)...`,
    );
    signature = await program.methods
      .requestWithdraw(WITHDRAW_LAMPORTS)
      .accountsPartial({
        owner: owner.publicKey,
        policy: policyAddress,
        vault: vaultAddress,
      })
      .signers([owner])
      .rpc({ commitment: "confirmed" });
  }

  console.log(`\n${action === "cancel" ? "cancel_withdraw" : "request_withdraw"}: ${signature}`);
  console.log(`Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

  // Re-read so the demo shows the new pending state; a read failure must not
  // make a successful transaction look failed.
  try {
    const updated = await fetchPolicy(policyAddress);
    const unlockAt = updated.pendingUnlockAt.toNumber();
    console.log(
      unlockAt === 0
        ? "Pending withdrawal: none"
        : `Pending withdrawal: ${updated.pendingAmount.toString()} lamports, ` +
            `unlocks ${new Date(unlockAt * 1000).toISOString()}`,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Could not re-read the policy: ${message}`);
  }
}

main().catch((err: unknown) => {
  // Message only: never dump key material or the full environment.
  console.error(`\nFailed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
