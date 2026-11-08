#!/usr/bin/env tsx
/**
 * Devnet bootstrap for SpendGuard demo (M3).
 *
 * 1. Generates keypairs for agent, keeper and 4 mock services (3 allowlisted + 1 rogue) in backend/keys/ (only if missing).
 * 2. Funds agent + keeper with 0.1 SOL each from owner wallet.
 * 3. Creates a fresh policy (per_tx 0.05 SOL, window 0.2 SOL, window 86400s, withdraw_delay CLI default 60).
 * 4. Deposits 1 SOL into vault.
 * 5. Prints POLICY_ADDRESS and every public key (never secret keys).
 *
 * Devnet only. Abort if RPC URL does not contain "devnet".
 * Run:  yarn setup:demo [--withdraw-delay 60] [--owner ~/.config/solana/id.json]
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import BN from "bn.js";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";

// Resolve backend root regardless of cwd (script lives in backend/scripts/)
const BACKEND_DIR = path.resolve(__dirname, "..");
const KEYS_DIR = path.join(BACKEND_DIR, "keys");

// Load env before importing config (config calls dotenv.config internally)
process.chdir(BACKEND_DIR);

// Import after chdir so dotenv reads backend/.env
import { loadConfig } from "../src/config";
import { loadKeypair } from "../src/chain/keypairs";
import { derivePolicyPda, deriveVaultPda } from "../src/chain/pdas";
import { getConnection } from "../src/chain/connection";
import { createProgram } from "../src/chain/program";

// ---------------------------------------------------------------- CLI

function printHelp(): void {
  console.log(`
SpendGuard devnet bootstrap (M3)

Usage:
  yarn setup:demo [--withdraw-delay <seconds>] [--owner <keypair-path>]
  yarn tsx scripts/setup-demo.ts --help

Options:
  --withdraw-delay, --delay <n>   Withdraw delay in seconds (1..604800), default 60
  --owner <path>                  Owner keypair (default: ~/.config/solana/id.json or ANCHOR_WALLET)
  --help, -h                      Show this help
`);
}

function parseArgs(argv: string[]): { withdrawDelay: number; ownerPath: string | null; help: boolean } {
  let withdrawDelay = 60;
  let ownerPath: string | null = null;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--withdraw-delay" || arg === "--delay") {
      const raw = argv[++i];
      if (raw === undefined) throw new Error(`${arg} requires a value`);
      const n = Number(raw);
      if (!Number.isInteger(n)) throw new Error(`--withdraw-delay must be an integer, got "${raw}"`);
      withdrawDelay = n;
    } else if (arg.startsWith("--withdraw-delay=")) {
      const raw = arg.slice("--withdraw-delay=".length);
      const n = Number(raw);
      if (!Number.isInteger(n)) throw new Error(`--withdraw-delay must be an integer, got "${raw}"`);
      withdrawDelay = n;
    } else if (arg === "--owner") {
      const raw = argv[++i];
      if (raw === undefined) throw new Error(`--owner requires a path`);
      ownerPath = raw;
    } else if (arg.startsWith("--owner=")) {
      ownerPath = arg.slice("--owner=".length);
    } else {
      throw new Error(`Unknown argument: ${arg} (see --help)`);
    }
  }

  if (!Number.isInteger(withdrawDelay) || withdrawDelay < 1 || withdrawDelay > 604800) {
    throw new Error(`--withdraw-delay must be an integer 1..604800, got ${withdrawDelay}`);
  }

  return { withdrawDelay, ownerPath, help };
}

function resolveOwnerPath(cliPath: string | null): string {
  if (cliPath) return cliPath;
  if (process.env["ANCHOR_WALLET"]) return process.env["ANCHOR_WALLET"]!;
  return path.join(os.homedir(), ".config/solana/id.json");
}

function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

// ---------------------------------------------------------------- keypairs

type KeyFile = { name: string; filename: string; label: string };

const KEY_FILES: KeyFile[] = [
  { name: "agent", filename: "agent-keypair.json", label: "agent" },
  { name: "keeper", filename: "keeper-keypair.json", label: "keeper" },
  { name: "service-1", filename: "service-1-keypair.json", label: "service-1 (allowlisted)" },
  { name: "service-2", filename: "service-2-keypair.json", label: "service-2 (allowlisted)" },
  { name: "service-3", filename: "service-3-keypair.json", label: "service-3 (allowlisted)" },
  { name: "rogue-service", filename: "rogue-service-keypair.json", label: "rogue-service (NOT allowlisted)" },
];

function ensureKeys(): Map<string, Keypair> {
  fs.mkdirSync(KEYS_DIR, { recursive: true, mode: 0o700 });
  // Ensure directory is not too permissive even if it existed
  try { fs.chmodSync(KEYS_DIR, 0o700); } catch { /* ignore on non-POSIX */ }

  const out = new Map<string, Keypair>();
  for (const kf of KEY_FILES) {
    const fullPath = path.join(KEYS_DIR, kf.filename);
    let kp: Keypair;
    if (fs.existsSync(fullPath)) {
      kp = loadKeypair(fullPath);
      console.log(`  reuse ${kf.label}: ${kp.publicKey.toBase58()}  (${kf.filename})`);
    } else {
      kp = Keypair.generate();
      fs.writeFileSync(fullPath, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
      // Re-read through loadKeypair to validate
      kp = loadKeypair(fullPath);
      console.log(`  created ${kf.label}: ${kp.publicKey.toBase58()}  (${kf.filename})`);
    }
    out.set(kf.name, kp);
  }
  return out;
}

// ---------------------------------------------------------------- main

async function main(): Promise<void> {
  const { withdrawDelay, ownerPath, help } = parseArgs(process.argv.slice(2));
  if (help) { printHelp(); return; }

  // 0. Config + devnet guard
  const config = loadConfig();
  const rpcUrl = config.rpcUrl;
  if (!/devnet/i.test(rpcUrl)) {
    console.error(`\nAbort: RPC_URL must contain "devnet" (got "${rpcUrl}").`);
    console.error(`SpendGuard is devnet-only (hard rule 2). Set RPC_URL to a devnet endpoint.\n`);
    process.exit(1);
  }

  // Owner wallet
  const ownerPathResolved = resolveOwnerPath(ownerPath);
  const ownerExpanded = expandHome(ownerPathResolved);
  console.log(`\nOwner wallet: ${ownerPathResolved}`);
  const owner = loadKeypair(ownerExpanded);
  console.log(`Owner pubkey: ${owner.publicKey.toBase58()}`);

  const connection: Connection = getConnection();
  console.log(`RPC: ${rpcUrl}`);
  console.log(`Program: ${config.programId.toBase58()}`);
  console.log(`Withdraw delay: ${withdrawDelay}s`);

  // IDL / program sanity (createProgram throws on mismatch)
  const program = createProgram(owner, connection);
  console.log(`IDL check OK (${program.programId.toBase58()})`);

  // Balance gate: need ~1.3 SOL (deposit 1 + funding 0.2 + rents/fees)
  const ownerBalance = await connection.getBalance(owner.publicKey);
  console.log(`Owner balance: ${(ownerBalance / 1e9).toFixed(4)} SOL`);
  const MIN_OWNER_LAMPORTS = 1_300_000_000; // 1.3 SOL
  if (ownerBalance < MIN_OWNER_LAMPORTS) {
    console.error(`\nAbort: owner needs >= 1.3 SOL for demo (has ${(ownerBalance / 1e9).toFixed(4)} SOL).`);
    console.error(`Fund it:  solana airdrop 2 ${owner.publicKey.toBase58()} --url devnet`);
    console.error(`Or:       https://faucet.solana.com\n`);
    process.exit(1);
  }

  // Check program is actually deployed on this cluster
  const progInfo = await connection.getAccountInfo(config.programId);
  if (progInfo === null) {
    console.error(`\nAbort: program ${config.programId.toBase58()} not found on ${rpcUrl}.`);
    console.error(`Deploy first:  anchor build && anchor deploy --provider.cluster devnet`);
    console.error(`Or:  solana program deploy target/deploy/spendguard.so --program-id <KEYPAIR> --url devnet\n`);
    process.exit(1);
  }
  console.log(`Program deployed: ${progInfo.data.length} bytes, executable=${progInfo.executable}`);

  // 1. Keys
  console.log(`\nKeys in ${path.relative(process.cwd(), KEYS_DIR) || KEYS_DIR}:`);
  const keys = ensureKeys();
  const agent = keys.get("agent")!;
  const keeper = keys.get("keeper")!;
  const svc1 = keys.get("service-1")!;
  const svc2 = keys.get("service-2")!;
  const svc3 = keys.get("service-3")!;
  const rogue = keys.get("rogue-service")!;

  // 2. Fund agent + keeper (0.1 SOL each) — must be system accounts before initialize_policy
  const FUND_LAMPORTS = 100_000_000; // 0.1 SOL
  const ALREADY_FUNDED = 50_000_000; // skip if >= 0.05 SOL
  const agentBal = await connection.getBalance(agent.publicKey);
  const keeperBal = await connection.getBalance(keeper.publicKey);
  console.log(`\nFunding (agent bal ${(agentBal / 1e9).toFixed(4)} SOL, keeper bal ${(keeperBal / 1e9).toFixed(4)} SOL):`);

  const transfers: { to: PublicKey; label: string; bal: number }[] = [];
  if (agentBal < ALREADY_FUNDED) transfers.push({ to: agent.publicKey, label: "agent", bal: agentBal });
  else console.log(`  skip agent (already ${(agentBal / 1e9).toFixed(4)} SOL)`);

  if (keeperBal < ALREADY_FUNDED) transfers.push({ to: keeper.publicKey, label: "keeper", bal: keeperBal });
  else console.log(`  skip keeper (already ${(keeperBal / 1e9).toFixed(4)} SOL)`);

  let fundSig: string | null = null;
  if (transfers.length > 0) {
    const tx = new Transaction();
    for (const t of transfers) {
      tx.add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: t.to, lamports: FUND_LAMPORTS }));
    }
    fundSig = await sendAndConfirmTransaction(connection, tx, [owner], { commitment: "confirmed" });
    console.log(`  funded ${transfers.map((t) => t.label).join(" + ")}: ${fundSig}`);
    console.log(`  explorer: https://explorer.solana.com/tx/${fundSig}?cluster=devnet`);
  } else {
    console.log(`  both already funded, skipping`);
  }

  // 3. Create policy — fresh policy_id
  // Find an unused PDA (Date.now() + bump loop for idempotency)
  let policyId = new BN(Date.now());
  let policyPda: PublicKey;
  let attempts = 0;
  while (true) {
    const derived = derivePolicyPda(owner.publicKey, policyId);
    const existing = await connection.getAccountInfo(derived.address);
    if (existing === null) { policyPda = derived.address; break; }
    policyId = policyId.addn(1);
    attempts++;
    if (attempts > 20) throw new Error("Could not find unused policy_id after 20 attempts");
  }
  const vaultPda = deriveVaultPda(policyPda).address;

  const perTxLimit = new BN(50_000_000);   // 0.05 SOL
  const windowLimit = new BN(200_000_000); // 0.2 SOL
  const windowSeconds = new BN(86400);
  const withdrawDelayBn = new BN(withdrawDelay);

  console.log(`\nCreating policy:`);
  console.log(`  policy_id: ${policyId.toString()}`);
  console.log(`  policy PDA: ${policyPda.toBase58()}`);
  console.log(`  vault PDA: ${vaultPda.toBase58()}`);
  console.log(`  per_tx_limit: 0.05 SOL (50,000,000 lamports)`);
  console.log(`  window_limit: 0.2 SOL (200,000,000 lamports)`);
  console.log(`  window_seconds: 86400`);
  console.log(`  withdraw_delay_seconds: ${withdrawDelay}`);
  console.log(`  allowlist: ${svc1.publicKey.toBase58()}, ${svc2.publicKey.toBase58()}, ${svc3.publicKey.toBase58()}`);

  const initSig = await program.methods
    .initializePolicy(policyId, perTxLimit, windowLimit, windowSeconds, withdrawDelayBn, [svc1.publicKey, svc2.publicKey, svc3.publicKey])
    .accountsPartial({
      owner: owner.publicKey,
      agent: agent.publicKey,
      policy: policyPda,
      vault: vaultPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([owner])
    .rpc({ commitment: "confirmed" });

  console.log(`  initialize_policy: ${initSig}`);
  console.log(`  explorer: https://explorer.solana.com/tx/${initSig}?cluster=devnet`);

  // 4. Deposit 1 SOL into vault
  console.log(`\nDepositing 1 SOL into vault...`);
  const depositSig = await program.methods
    .deposit(new BN(1_000_000_000))
    .accountsPartial({
      owner: owner.publicKey,
      policy: policyPda,
      vault: vaultPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([owner])
    .rpc({ commitment: "confirmed" });

  console.log(`  deposit: ${depositSig}`);
  console.log(`  explorer: https://explorer.solana.com/tx/${depositSig}?cluster=devnet`);

  // 5. Summary (never secret keys)
  const vaultBal = await connection.getBalance(vaultPda);
  console.log(`\n` + "=".repeat(60));
  console.log(`Demo ready (devnet)`);
  console.log("=".repeat(60));
  console.log(`POLICY_ADDRESS=${policyPda.toBase58()}`);
  console.log(`\nPut this in backend/.env:`);
  console.log(`  POLICY_ADDRESS=${policyPda.toBase58()}`);
  console.log(`\nPublic keys:`);
  console.log(`  owner:         ${owner.publicKey.toBase58()}`);
  console.log(`  agent:         ${agent.publicKey.toBase58()}`);
  console.log(`  keeper:        ${keeper.publicKey.toBase58()}`);
  console.log(`  vault:         ${vaultPda.toBase58()}  (${(vaultBal / 1e9).toFixed(4)} SOL)`);
  console.log(`  service-1:     ${svc1.publicKey.toBase58()}  (allowlisted)`);
  console.log(`  service-2:     ${svc2.publicKey.toBase58()}  (allowlisted)`);
  console.log(`  service-3:     ${svc3.publicKey.toBase58()}  (allowlisted)`);
  console.log(`  rogue-service: ${rogue.publicKey.toBase58()}  (NOT allowlisted)`);
  console.log(`\nPolicy:`);
  console.log(`  policy_id: ${policyId.toString()}`);
  console.log(`  per_tx_limit: 0.05 SOL`);
  console.log(`  window_limit: 0.2 SOL`);
  console.log(`  window_seconds: 86400`);
  console.log(`  withdraw_delay_seconds: ${withdrawDelay}`);
  console.log(`\nSignatures:`);
  if (fundSig) console.log(`  fund:              ${fundSig}`);
  console.log(`  initialize_policy: ${initSig}`);
  console.log(`  deposit:           ${depositSig}`);
  console.log(`\nVerify:  yarn print:policy ${policyPda.toBase58()}`);
  console.log(`Explorer policy: https://explorer.solana.com/address/${policyPda.toBase58()}?cluster=devnet`);
  console.log("=".repeat(60) + "\n");
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  // Never dump secret keys; just the error
  console.error(`\nFailed: ${msg}`);
  if (err instanceof Error && err.stack) {
    // Trim stack to first few lines to avoid leaking paths with secrets
    console.error(err.stack.split("\n").slice(0, 6).join("\n"));
  }
  process.exit(1);
});
