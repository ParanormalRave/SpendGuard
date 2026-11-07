import { AnchorProvider, Program, Wallet } from "@anchor-lang/core";
import { type Connection, type Keypair } from "@solana/web3.js";
import idlJson from "../idl/spendguard.json";
import type { Spendguard } from "../idl/spendguard";
import { loadConfig } from "../config";
import { getConnection } from "./connection";
import { loadKeypair } from "./keypairs";

// The JSON import is typed as its literal shape; the generated `Spendguard`
// type is the same IDL in a form the Anchor client understands.
const IDL = idlJson as unknown as Spendguard;

let agentProgram: Program<Spendguard> | undefined;

/**
 * Builds a typed Anchor client whose transactions are paid for and signed by
 * `payer`.
 *
 * The bundled IDL is checked against PROGRAM_ID first: after a rebuild the two
 * can drift, and a silent mismatch would send instructions the deployed
 * program cannot decode. The keeper (M5) will call this with its own keypair.
 */
export function createProgram(payer: Keypair, connection: Connection = getConnection()): Program<Spendguard> {
  const config = loadConfig();

  if (IDL.address !== config.programId.toBase58()) {
    throw new Error(
      `IDL targets program ${IDL.address}, but PROGRAM_ID is ${config.programId.toBase58()}. ` +
        `Run ./scripts/sync-idl.sh after "anchor build", or fix PROGRAM_ID in backend/.env.`,
    );
  }

  const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" });
  return new Program<Spendguard>(IDL, provider);
}

/**
 * The shared program client, signed by the agent keypair.
 *
 * Every payment goes out as `agent_transfer` from the agent key, because the
 * program accepts that instruction only from `policy.agent`.
 */
export function getProgram(): Program<Spendguard> {
  if (agentProgram === undefined) {
    agentProgram = createProgram(loadKeypair(loadConfig().agentKeypairPath));
  }
  return agentProgram;
}
