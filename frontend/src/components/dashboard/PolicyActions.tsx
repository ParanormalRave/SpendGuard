"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { deposit, setPaused, type PolicyView } from "@/lib/chain";
import { lamportsToSol, solToLamports } from "@/lib/money";
import { explainError } from "@/lib/errors";

function shortSig(sig: string) {
  return `${sig.slice(0, 8)}…${sig.slice(-8)}`;
}

export function DepositAction({
  policy,
  vaultBalance,
  onDone,
}: {
  policy: PolicyView;
  vaultBalance: bigint | null;
  onDone: () => void;
}) {
  const wallet = useWallet();
  const isOwner = !!wallet.publicKey && wallet.publicKey.equals(policy.owner);

  const [amount, setAmount] = useState("0.01");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);

  const parsed = (() => {
    const t = amount.trim();
    if (!t) return { lamports: null as bigint | null, error: "Enter an amount" };
    try {
      const lamports = solToLamports(t);
      if (lamports <= 0n) return { lamports: null, error: "Amount must be greater than 0" };
      return { lamports, error: null };
    } catch (e) {
      return { lamports: null, error: e instanceof Error ? e.message : "Invalid amount" };
    }
  })();

  const disabled = !isOwner || loading || parsed.error !== null;

  async function handleDeposit() {
    setError(null);
    setSig(null);
    if (!isOwner) {
      setError("Only the policy owner can deposit.");
      return;
    }
    if (parsed.lamports === null) {
      setError(parsed.error);
      return;
    }
    setLoading(true);
    try {
      const s = await deposit(wallet, policy.address, parsed.lamports);
      setSig(s);
      onDone();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const code =
        (e as { error?: { errorCode?: { code?: string } } })?.error?.errorCode?.code ?? null;
      const known = ["InsufficientVaultFunds", "InvalidAmount", "Unauthorized"];
      let explained: string | null = null;
      for (const c of known) if (msg.includes(c)) explained = explainError(c);
      setError(explained ? `${explained} (${msg})` : code ? `${explainError(code)} (${msg})` : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 rounded-control border border-line bg-ink p-4">
      <h3 className="text-[0.9375rem] font-semibold text-paper">Deposit</h3>
      <p className="text-[0.8125rem] text-muted">
        Fund the vault. First deposit must be at least the rent-exempt minimum (~0.00089 SOL). Vault:{" "}
        <span className="font-mono text-paper">{vaultBalance !== null ? `${lamportsToSol(vaultBalance)} SOL` : "—"}</span>
      </p>
      {!isOwner ? (
        <p role="alert" className="rounded-control border border-caution/30 bg-caution-wash px-3 py-2 text-[0.8125rem] text-paper">
          Only the owner ({shortSig(policy.owner.toBase58())}) can deposit. Connect the owner wallet.
        </p>
      ) : null}
      <label className="block">
        <span className="mb-1 block text-[0.8125rem] font-semibold text-paper">Amount</span>
        <div className="relative">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.01"
            inputMode="decimal"
            disabled={loading}
            className="w-full rounded-control border border-line bg-surface-sunken px-3 py-2 pr-12 text-[0.9375rem] text-paper placeholder:text-muted focus:border-leash focus:outline-none disabled:opacity-60"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[0.8125rem] font-semibold text-muted">
            SOL
          </span>
        </div>
        <span className="mt-1 block text-[0.8125rem] text-muted">
          {parsed.lamports !== null ? `${parsed.lamports.toString()} lamports` : parsed.error ?? "—"}
        </span>
      </label>
      {error ? (
        <p role="alert" className="rounded-control border border-blocked/30 bg-blocked/10 px-3 py-2 text-[0.8125rem] text-blocked">
          {error}
        </p>
      ) : null}
      {sig ? (
        <p className="break-all text-[0.8125rem] text-allowed">
          Deposited —{" "}
          <a
            href={`https://explorer.solana.com/tx/${sig}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-leash hover:underline"
          >
            {shortSig(sig)} on Explorer
          </a>
        </p>
      ) : null}
      <button
        type="button"
        onClick={handleDeposit}
        disabled={disabled}
        className="inline-flex min-h-11 items-center justify-center rounded-control bg-leash-strong px-5 text-[0.9375rem] font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Depositing…" : "Deposit"}
      </button>
    </div>
  );
}

export function PauseAction({
  policy,
  onDone,
}: {
  policy: PolicyView;
  onDone: () => void;
}) {
  const wallet = useWallet();
  const isOwner = !!wallet.publicKey && wallet.publicKey.equals(policy.owner);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);

  async function handleToggle() {
    setError(null);
    setSig(null);
    if (!isOwner) {
      setError("Only the owner can pause or resume.");
      return;
    }
    setLoading(true);
    try {
      const s = await setPaused(wallet, policy.address, !policy.paused);
      setSig(s);
      onDone();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const code =
        (e as { error?: { errorCode?: { code?: string } } })?.error?.errorCode?.code ?? null;
      setError(code ? `${explainError(code)} (${msg})` : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 rounded-control border border-line bg-ink p-4">
      <h3 className="text-[0.9375rem] font-semibold text-paper">{policy.paused ? "Resume agent" : "Pause agent"}</h3>
      <p className="text-[0.8125rem] text-muted">
        {policy.paused ? "Agent is paused — no payments can go through." : "Pause stops the agent from paying until you resume."}
      </p>
      {!isOwner ? (
        <p role="alert" className="rounded-control border border-caution/30 bg-caution-wash px-3 py-2 text-[0.8125rem] text-paper">
          Only the owner can pause or resume.
        </p>
      ) : null}
      {policy.paused ? (
        <div className="rounded-control border border-blocked/30 bg-blocked-wash px-3 py-2 text-[0.8125rem] font-semibold text-blocked">
          Agent paused. No payments can go through.
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-control border border-blocked/30 bg-blocked/10 px-3 py-2 text-[0.8125rem] text-blocked">
          {error}
        </p>
      ) : null}
      {sig ? (
        <p className="break-all text-[0.8125rem] text-allowed">
          {policy.paused ? "Resumed" : "Paused"} —{" "}
          <a
            href={`https://explorer.solana.com/tx/${sig}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-leash hover:underline"
          >
            {shortSig(sig)} on Explorer
          </a>
        </p>
      ) : null}
      <button
        type="button"
        onClick={handleToggle}
        disabled={!isOwner || loading}
        className={
          policy.paused
            ? "inline-flex min-h-11 items-center justify-center rounded-control bg-leash-strong px-5 text-[0.9375rem] font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-60"
            : "inline-flex min-h-11 items-center justify-center rounded-control border border-blocked bg-transparent px-5 text-[0.9375rem] font-semibold text-blocked disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        {loading ? (policy.paused ? "Resuming…" : "Pausing…") : policy.paused ? "Resume agent" : "Pause agent"}
      </button>
    </div>
  );
}
