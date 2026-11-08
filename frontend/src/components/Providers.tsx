"use client";

import type { Adapter } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { useMemo, type ReactNode } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { GOOGLE_CLIENT_ID, RPC_URL } from "@/lib/env";

/**
 * Client-side Solana context for the whole app: one devnet connection, the two
 * wallet adapters the README asks for, and the wallet selection modal.
 *
 * The adapters are created once. Recreating them on every render would drop the
 * connected wallet, because WalletProvider keys its state off the adapter
 * instances.
 */
export function Providers({ children }: { children: ReactNode }) {
  const wallets = useMemo<Adapter[]>(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  const inner = (
    <ConnectionProvider endpoint={RPC_URL} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );

  if (!GOOGLE_CLIENT_ID) return inner;

  return <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{inner}</GoogleOAuthProvider>;
}
