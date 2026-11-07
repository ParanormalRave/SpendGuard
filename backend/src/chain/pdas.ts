import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";
import { loadConfig } from "../config";

/** Policy ids arrive as BN from the chain, bigint/number in code, strings from SQLite. */
export type PolicyId = BN | bigint | number | string;

export interface DerivedPda {
  address: PublicKey;
  bump: number;
}

const POLICY_SEED = Buffer.from("policy", "utf8");
const VAULT_SEED = Buffer.from("vault", "utf8");
const U64_BYTES = 8;

/**
 * Policy PDA: seeds [b"policy", owner, policy_id.to_le_bytes()].
 * Must match contracts/programs/spendguard/src/state.rs.
 */
export function derivePolicyPda(owner: PublicKey, policyId: PolicyId): DerivedPda {
  const [address, bump] = PublicKey.findProgramAddressSync(
    [POLICY_SEED, owner.toBuffer(), encodePolicyId(policyId)],
    loadConfig().programId,
  );
  return { address, bump };
}

/** Vault PDA: seeds [b"vault", policy]. Must match the program's vault validation. */
export function deriveVaultPda(policy: PublicKey): DerivedPda {
  const [address, bump] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, policy.toBuffer()],
    loadConfig().programId,
  );
  return { address, bump };
}

/**
 * Encodes a policy id as exactly 8 little-endian bytes, like
 * `policy_id.to_le_bytes()` in Rust. BN is used so values above
 * Number.MAX_SAFE_INTEGER survive the trip (the program accepts any u64).
 */
function encodePolicyId(policyId: PolicyId): Buffer {
  const value = BN.isBN(policyId)
    ? policyId
    : new BN(typeof policyId === "bigint" ? policyId.toString() : policyId);

  if (value.isNeg()) {
    throw new Error(`policyId must not be negative: ${value.toString()}`);
  }
  if (value.bitLength() > 64) {
    throw new Error(`policyId must fit in a u64: ${value.toString()}`);
  }

  return value.toArrayLike(Buffer, "le", U64_BYTES);
}
