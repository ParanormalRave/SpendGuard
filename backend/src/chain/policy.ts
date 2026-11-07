import type { IdlAccounts } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import type { Spendguard } from "../idl/spendguard";
import { getConnection, getRpcHostname } from "./connection";
import { deriveVaultPda } from "./pdas";
import { getProgram } from "./program";

/** The decoded `Policy` account, typed from the IDL. */
export type PolicyAccount = IdlAccounts<Spendguard>["policy"];

/**
 * Reads and decodes a Policy account.
 *
 * `fetchNullable` returns null both when nothing lives at the address and when
 * the account exists but is not a Policy (its discriminator does not match),
 * so a stale or wrong address gets one clear error instead of a decode failure.
 * Throws rather than returning null: every caller here needs a policy.
 */
export async function fetchPolicy(address: PublicKey | string): Promise<PolicyAccount> {
  const policyAddress = toPublicKey(address, "Policy address");
  const policy = await getProgram().account.policy.fetchNullable(policyAddress);

  if (policy === null) {
    // Show only the RPC hostname: a provider URL can carry an API key in its path.
    throw new Error(
      `No policy found at ${policyAddress.toBase58()} on ${getRpcHostname()}. ` +
        "Check the address and that you are on the right cluster.",
    );
  }

  return policy;
}

/**
 * Lamports held by the policy's vault.
 *
 * Returns 0 when the vault account does not exist. That is both the
 * never-deposited case and the drained case: the program purges the vault on
 * the final withdrawal, so a vault PDA with no account is normal, not an error.
 */
export async function getVaultBalance(policy: PublicKey | string): Promise<number> {
  const vault = deriveVaultPda(toPublicKey(policy, "Policy address")).address;
  const account = await getConnection().getAccountInfo(vault);
  return account?.lamports ?? 0;
}

function toPublicKey(address: PublicKey | string, label: string): PublicKey {
  if (address instanceof PublicKey) {
    return address;
  }
  try {
    return new PublicKey(address);
  } catch {
    throw new Error(`${label} is not a valid Solana public key: "${address}"`);
  }
}
