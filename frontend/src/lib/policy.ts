import BN from "bn.js";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { confirmSignature } from "./confirm";
import { explainError } from "./errors";
import { getConnectionForRead, getProgram, getRpcHostname, type WalletLike } from "./program";
import { PROGRAM_ID } from "./env";

export interface CreatePolicyParams {
  agent: PublicKey;
  perTxLimit: bigint;
  windowLimit: bigint;
  windowSeconds: number;
  withdrawDelaySeconds: number;
  allowedRecipients: PublicKey[];
  policyId?: bigint;
}

export interface CreatePolicyResult {
  signature: string;
  policy: PublicKey;
  policyId: bigint;
  vault: PublicKey;
}

function toBN(value: bigint | number, label: string): BN {
  try {
    return new BN(value.toString());
  } catch {
    throw new Error(`Invalid ${label}: ${String(value)}`);
  }
}

function encodePolicyId(policyId: bigint): Buffer {
  const bn = toBN(policyId, "policyId");
  if (bn.isNeg()) throw new Error("policyId must not be negative");
  if (bn.bitLength() > 64) throw new Error("policyId must fit in u64");
  return bn.toArrayLike(Buffer, "le", 8);
}

/**
 * Creates a new policy PDA. The policy_id is Date.now() milliseconds as u64.
 * Returns the tx signature and the derived policy address.
 */
export async function createPolicy(
  wallet: WalletLike,
  params: CreatePolicyParams
): Promise<CreatePolicyResult> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");

  const program = getProgram(wallet);
  const owner = wallet.publicKey;

  // Validate agent !== owner pre-flight (contract will also reject)
  if (params.agent.equals(owner)) {
    throw new Error("Agent must be different from owner");
  }
  if (params.agent.equals(PublicKey.default)) {
    throw new Error("Agent cannot be the zero address");
  }

  if (params.perTxLimit <= 0n) throw new Error("Per-transaction limit must be greater than 0");
  if (params.windowLimit <= 0n) throw new Error("Window limit must be greater than 0");
  if (params.perTxLimit > params.windowLimit) {
    throw new Error("Per-transaction limit must be at most the window limit");
  }
  if (!Number.isInteger(params.windowSeconds) || params.windowSeconds <= 0) {
    throw new Error("Window length must be a positive number of seconds");
  }
  if (
    !Number.isInteger(params.withdrawDelaySeconds) ||
    params.withdrawDelaySeconds < 1 ||
    params.withdrawDelaySeconds > 604800
  ) {
    throw new Error("Withdrawal delay must be between 1 second and 7 days");
  }
  if (params.allowedRecipients.length > 10) {
    throw new Error("At most 10 recipients allowed");
  }

  const policyId = params.policyId ?? BigInt(Date.now());
  const policyIdLe = encodePolicyId(policyId);

  const [policy] = PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), owner.toBuffer(), policyIdLe],
    program.programId
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), policy.toBuffer()],
    program.programId
  );

  // Extra local duplicate/zero checks for clearer errors before RPC
  const seen = new Set<string>();
  for (const r of params.allowedRecipients) {
    const s = r.toBase58();
    if (r.equals(PublicKey.default)) throw new Error("Recipient cannot be the zero address");
    if (r.equals(policy) || r.equals(vault)) throw new Error("Recipient cannot be the policy or vault address");
    if (seen.has(s)) throw new Error("Duplicate recipient");
    seen.add(s);
  }

  // Safe diagnostics (no secrets): endpoint hostname, program, commitment, blockhash freshness
  const conn = getConnectionForRead();
  let latest: { blockhash: string; lastValidBlockHeight: number } | null = null;
  try {
    latest = await conn.getLatestBlockhash("confirmed");
    console.debug(
      `[createPolicy] rpc=${getRpcHostname()} program=${PROGRAM_ID} commitment=confirmed blockhash=${latest.blockhash.slice(0, 4)}…${latest.blockhash.slice(-4)} lastValidBlockHeight=${latest.lastValidBlockHeight} policy=${policy.toBase58().slice(0, 4)}…`
    );
  } catch (e) {
    console.warn(`[createPolicy] getLatestBlockhash failed on ${getRpcHostname()}: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Build instruction via Anchor, then send with fresh blockhash through the provider
  // so we can log blockhash/lastValidBlockHeight and verify submission before any retry.
  const method = program.methods
    .initializePolicy(
      toBN(policyId, "policyId"),
      toBN(params.perTxLimit, "perTxLimit"),
      toBN(params.windowLimit, "windowLimit"),
      toBN(params.windowSeconds, "windowSeconds"),
      toBN(params.withdrawDelaySeconds, "withdrawDelaySeconds"),
      params.allowedRecipients
    )
    .accountsPartial({
      owner,
      agent: params.agent,
      policy,
      vault,
      systemProgram: SystemProgram.programId,
    });

  // Single send only — never auto-retry createPolicy (would create a second PDA if first landed).
  let signature: string;
  try {
    signature = await method.rpc();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const code =
      (err as { error?: { errorCode?: { code?: string } } })?.error?.errorCode?.code ?? null;
    if (code) throw new Error(`${explainError(code)} (${msg})`);
    const ctx = `rpc=${getRpcHostname()} program=${PROGRAM_ID} commitment=confirmed lastValidBlockHeight=${latest?.lastValidBlockHeight ?? "unknown"}`;
    throw new Error(`${msg} (${ctx})`);
  }

  // Poll confirmation: every 2s for up to 90s or until lastValidBlockHeight passes
  try {
    await confirmSignature(conn, signature, latest?.lastValidBlockHeight);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes(signature))
      throw new Error(`${msg} signature=${signature} https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    throw e instanceof Error ? e : new Error(msg);
  }

  return { signature, policy, policyId, vault };
}

export function derivePolicyPda(owner: PublicKey, policyId: bigint, programId: PublicKey) {
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), owner.toBuffer(), encodePolicyId(policyId)],
    programId
  );
  return address;
}
