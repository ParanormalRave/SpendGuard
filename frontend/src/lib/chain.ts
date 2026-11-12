// Read-only chain helpers (Build Guide 5.4.1) + owner actions deposit/pause (IDL-verified).
//
// Verified against:
// - docs: frontend/src/idl/spendguard.json (Policy type, PDA seeds, deposit + set_paused accounts)
// - contracts/programs/spendguard/src/state.rs (field order)
// - contracts/programs/spendguard/src/instructions/initialize_policy.rs (policy seeds) + agent_transfer.rs (vault seeds)
// - contracts/programs/spendguard/src/instructions/deposit.rs + set_paused.rs (signer + PDA constraints)
// - existing helpers: frontend/src/lib/program.ts (IDL address check + getProgram) + frontend/src/lib/policy.ts (PDA derivation)
//
// On-chain data is the source of truth. No backend inventing.

import { AnchorProvider, Program } from "@anchor-lang/core";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import idlJson from "@/idl/spendguard.json";
import type { Spendguard } from "@/idl/spendguard";
import { PROGRAM_ID } from "./env";
import { getConnectionForRead, getProgram, type WalletLike } from "./program";
import { confirmSignature } from "./confirm";

const IDL = idlJson as unknown as Spendguard;

let readonlyProgram: Program<Spendguard> | null = null;

function getReadonlyConnection(): Connection {
  return getConnectionForRead();
}

function getReadonlyProgram(): Program<Spendguard> {
  if (readonlyProgram) return readonlyProgram;

  if (!PROGRAM_ID) {
    throw new Error("NEXT_PUBLIC_PROGRAM_ID is not set. Copy frontend/.env.example to .env.local and set it.");
  }
  let programId: PublicKey;
  try {
    programId = new PublicKey(PROGRAM_ID);
  } catch {
    throw new Error(`Invalid PROGRAM_ID: ${PROGRAM_ID}`);
  }
  if (IDL.address !== programId.toBase58()) {
    throw new Error(
      `IDL targets program ${IDL.address}, but NEXT_PUBLIC_PROGRAM_ID is ${programId.toBase58()}. Run ./scripts/sync-idl.sh after anchor build.`
    );
  }

  // Readonly provider: no wallet, just connection. Anchor still needs a wallet stub for the provider.
  const dummyWallet = {
    publicKey: PublicKey.default,
    signTransaction: async <T>(tx: T) => tx,
    signAllTransactions: async <T>(txs: T[]) => txs,
  } as unknown as AnchorProvider["wallet"];

  const provider = new AnchorProvider(getReadonlyConnection(), dummyWallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  } as unknown as ConstructorParameters<typeof AnchorProvider>[2]);
  readonlyProgram = new Program<Spendguard>(IDL, provider);
  return readonlyProgram;
}

/** Decoded Policy fields we read on the dashboard (subset used for display). */
export interface PolicyView {
  address: PublicKey;
  owner: PublicKey;
  agent: PublicKey;
  policyId: bigint;
  perTxLimit: bigint;
  windowLimit: bigint;
  windowSeconds: bigint;
  windowStart: bigint;
  spentInWindow: bigint;
  withdrawDelaySeconds: bigint;
  paused: boolean;
  pendingAmount: bigint;
  pendingUnlockAt: bigint;
  allowedRecipients: PublicKey[];
  allowedCount: number;
}

function toPolicyView(address: PublicKey, raw: unknown): PolicyView {
  const r = raw as Record<string, unknown>;
  const toBig = (v: unknown): bigint => {
    if (v instanceof BN) return BigInt(v.toString());
    if (typeof v === "bigint") return v;
    if (typeof v === "number") return BigInt(v);
    if (typeof v === "string") return BigInt(v);
    return BigInt(String(v));
  };
  const pk = (v: unknown) => new PublicKey(v as string | PublicKey);

  const allowed = (r.allowedRecipients as unknown[])?.map(pk) ?? [];
  const count = Number(r.allowedCount ?? 0);

  return {
    address,
    owner: pk(r.owner),
    agent: pk(r.agent),
    policyId: toBig(r.policyId ?? r.policy_id),
    perTxLimit: toBig(r.perTxLimit ?? r.per_tx_limit),
    windowLimit: toBig(r.windowLimit ?? r.window_limit),
    windowSeconds: toBig(r.windowSeconds ?? r.window_seconds),
    windowStart: toBig(r.windowStart ?? r.window_start),
    spentInWindow: toBig(r.spentInWindow ?? r.spent_in_window),
    withdrawDelaySeconds: toBig(r.withdrawDelaySeconds ?? r.withdraw_delay_seconds),
    paused: Boolean(r.paused),
    pendingAmount: toBig(r.pendingAmount ?? r.pending_amount),
    pendingUnlockAt: toBig(r.pendingUnlockAt ?? r.pending_unlock_at),
    allowedRecipients: allowed.slice(0, count),
    allowedCount: count,
  };
}

export async function fetchPolicyView(address: PublicKey): Promise<PolicyView> {
  const program = getReadonlyProgram();
  const raw = await program.account.policy.fetchNullable(address);
  if (raw === null) throw new Error(`Policy not found at ${address.toBase58()}`);
  return toPolicyView(address, raw);
}

/** Vault PDA: seeds [b"vault", policy.key] — verified against contract + IDL. */
export function deriveVaultPda(policyAddress: PublicKey): PublicKey {
  const programId = new PublicKey(PROGRAM_ID || IDL.address);
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), policyAddress.toBuffer()],
    programId
  );
  return vault;
}

/** Vault balance: 0 if the system-owned PDA has not been created yet (first deposit pending). */
export async function getVaultBalanceLamports(policyAddress: PublicKey): Promise<bigint> {
  const conn = getReadonlyConnection();
  const vault = deriveVaultPda(policyAddress);
  const bal = await conn.getBalance(vault, "confirmed");
  return BigInt(bal);
}

/** Owner filter: first field after 8-byte discriminator is `owner: pubkey`, so offset 8 (verified from state.rs + IDL). */
export async function listPoliciesByOwner(owner: PublicKey): Promise<PolicyView[]> {
  const program = getReadonlyProgram();
  const accounts = await program.account.policy.all([
    { memcmp: { offset: 8, bytes: owner.toBase58() } },
  ]);
  return accounts.map((a) => toPolicyView(a.publicKey, a.account));
}

// ------------------------------------------------------------------ owner actions (IDL-verified, no invented accounts)

// deposit: IDL `deposit(amount:u64)` accounts {owner signer+mut+has_one policy, policy mut pda, vault mut pda [vault, policy], systemProgram}
// Sends once, then polls getSignatureStatuses every 2s for 90s / lastValidBlockHeight (searchTransactionHistory:true).
// Verified against contracts/programs/spendguard/src/instructions/deposit.rs + IDL
export async function deposit(
  wallet: WalletLike,
  policyAddress: PublicKey,
  amountLamports: bigint
): Promise<string> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  if (amountLamports <= 0n) throw new Error("Amount must be greater than 0");
  const program = getProgram(wallet);
  const owner = wallet.publicKey;
  const vault = deriveVaultPda(policyAddress);
  const conn = getReadonlyConnection();
  let lastValidBlockHeight: number | undefined;
  try {
    lastValidBlockHeight = (await conn.getLatestBlockhash("confirmed")).lastValidBlockHeight;
  } catch {}
  const sig = await program.methods
    .deposit(new BN(amountLamports.toString()))
    .accountsPartial({
      owner,
      policy: policyAddress,
      vault,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  await confirmSignature(conn, sig, lastValidBlockHeight);
  return sig;
}

// set_paused: IDL `set_paused(paused:bool)` accounts {owner signer+has_one policy, policy mut pda}
// Same confirmation semantics as above; no auto-retry.
// Verified against contracts/programs/spendguard/src/instructions/set_paused.rs + IDL
export async function setPaused(
  wallet: WalletLike,
  policyAddress: PublicKey,
  paused: boolean
): Promise<string> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const program = getProgram(wallet);
  const owner = wallet.publicKey;
  const conn = getReadonlyConnection();
  let lastValidBlockHeight: number | undefined;
  try {
    lastValidBlockHeight = (await conn.getLatestBlockhash("confirmed")).lastValidBlockHeight;
  } catch {}
  const sig = await program.methods
    .setPaused(paused)
    .accountsPartial({
      owner,
      policy: policyAddress,
    })
    .rpc();
  await confirmSignature(conn, sig, lastValidBlockHeight);
  return sig;
}
// Any future tx-sending helpers (requestWithdraw/cancelWithdraw/executeWithdraw/addRecipient/closePolicy)
// must reuse confirmSignature with the same 2s/90s/lastValidBlockHeight/searchTransactionHistory contract.
