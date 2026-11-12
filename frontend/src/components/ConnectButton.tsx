"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";

const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-control bg-leash-strong px-4 text-[0.9375rem] font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-control border border-line px-4 text-[0.9375rem] font-semibold text-paper";

function shorten(address: string) {
  return `${address.slice(0, 4)}\u2026${address.slice(-4)}`;
}

/**
 * Our own connect control (design.md section 7). The wallet modal is the only
 * third-party markup; this button, its labels and its states are ours.
 */
export function ConnectButton() {
  const { publicKey, connected, connecting, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const address = publicKey?.toBase58() ?? null;

  // Reset the "Copied" label shortly after a copy, without a toast library.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setError(null);
    } catch {
      setError("Could not copy the address. Select it and copy it by hand.");
    }
  }

  async function handleDisconnect() {
    try {
      await disconnect();
      setError(null);
    } catch {
      setError("Could not disconnect. Try again.");
    }
  }

  if (connecting) {
    return (
      <button type="button" className={primaryButton} disabled>
        Connecting...
      </button>
    );
  }

  if (!connected || !address) {
    return (
      <button type="button" className={primaryButton} onClick={() => setVisible(true)}>
        Connect wallet
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          title={address}
          aria-label={copied ? "Address copied" : `Copy address ${address}`}
          className="inline-flex min-h-11 items-center rounded-chip border border-line bg-panel px-3 font-mono text-[0.8125rem] text-paper"
        >
          {copied ? "Copied" : shorten(address)}
        </button>
        <button
          type="button"
          className={secondaryButton}
          onClick={handleDisconnect}
          aria-label="Disconnect wallet"
        >
          Disconnect
        </button>
      </div>
      {error ? (
        <p role="alert" className="max-w-[18rem] text-right text-[0.8125rem] text-blocked [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
          {error}
        </p>
      ) : null}
    </div>
  );
}
