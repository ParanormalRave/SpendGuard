import { AnchorProvider, Program } from "@anchor-lang/core";
import { Connection, PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import idlJson from "@/idl/spendguard.json";
import type { Spendguard } from "@/idl/spendguard";
import { PROGRAM_ID, RPC_URL } from "./env";

// The JSON import is the raw IDL; the generated type is camelCase for the client.
const IDL = idlJson as unknown as Spendguard;

let connection: Connection | null = null;

function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(RPC_URL, "confirmed");
  }
  return connection;
}

export interface WalletLike {
  publicKey: PublicKey | null;
  signTransaction?: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions?: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
}

/**
 * Returns a Program client bound to the connected wallet.
 * Throws if the wallet is not connected or PROGRAM_ID is not set.
 */
export function getProgram(wallet: WalletLike): Program<Spendguard> {
  if (!wallet.publicKey) {
    throw new Error("Wallet not connected");
  }

  if (!PROGRAM_ID) {
    throw new Error(
      "NEXT_PUBLIC_PROGRAM_ID is not set. Copy frontend/.env.example to .env.local and set it."
    );
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

  const conn = getConnection();

  // Anchor expects a Wallet with publicKey + sign methods. Wallet-adapter already matches.
  const anchorWallet = {
    publicKey: wallet.publicKey,
    signTransaction: wallet.signTransaction?.bind(wallet) as WalletLike["signTransaction"],
    signAllTransactions:
      wallet.signAllTransactions?.bind(wallet) ??
      (async <T>(txs: T[]) => {
        if (!wallet.signTransaction) throw new Error("Wallet cannot sign transactions");
        const signed: T[] = [];
        for (const tx of txs) {
          signed.push(await (wallet.signTransaction as (tx: T) => Promise<T>)(tx));
        }
        return signed;
      }),
  } as unknown as AnchorProvider["wallet"];

  if (!anchorWallet.signTransaction) {
    throw new Error("Wallet cannot sign transactions");
  }

  const provider = new AnchorProvider(conn, anchorWallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
    skipPreflight: false,
  } as unknown as ConstructorParameters<typeof AnchorProvider>[2]);
  return new Program<Spendguard>(IDL, provider);
}

export function getConnectionForRead(): Connection {
  return getConnection();
}

export function getRpcHostname(): string {
  try {
    return new URL(RPC_URL).hostname;
  } catch {
    return "unknown";
  }
}
