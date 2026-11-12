"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { createPolicy } from "@/lib/policy";
import { lamportsToSol, solToLamports } from "@/lib/money";
import { explainError } from "@/lib/errors";
import { BACKEND_URL } from "@/lib/env";

type Step = 1 | 2 | 3;

type WindowUnit = "minutes" | "hours" | "days";
type DelayPreset = "30m" | "1h" | "24h" | "custom";

const WINDOW_UNIT_SECONDS: Record<WindowUnit, number> = {
  minutes: 60,
  hours: 3600,
  days: 86400,
};

const DELAY_PRESET_SECONDS: Record<Exclude<DelayPreset, "custom">, number> = {
  "30m": 1800,
  "1h": 3600,
  "24h": 86400,
};

function isValidPubkey(value: string): boolean {
  if (!value.trim()) return false;
  try {
    const pk = new PublicKey(value.trim());
    if (pk.equals(PublicKey.default)) return false;
    return true;
  } catch {
    return false;
  }
}

function parseSol(value: string): { lamports: bigint | null; error: string | null } {
  const t = value.trim();
  if (!t) return { lamports: null, error: "Enter an amount" };
  try {
    const lamports = solToLamports(t);
    if (lamports <= 0n) return { lamports: null, error: "Amount must be greater than 0" };
    return { lamports, error: null };
  } catch (e) {
    return { lamports: null, error: e instanceof Error ? e.message : "Invalid amount" };
  }
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export default function CreatePage() {
  const wallet = useWallet();
  const owner = wallet.publicKey?.toBase58() ?? null;

  const [step, setStep] = useState<Step>(1);

  // Step 1 — automatic agent discovery from backend signing keypair
  const [agentFetched, setAgentFetched] = useState<string | null>(null);
  const [agentFetchLoading, setAgentFetchLoading] = useState(true);
  const [agentFetchError, setAgentFetchError] = useState<string | null>(null);
  const [manualAgent, setManualAgent] = useState("");
  const [agentCopied, setAgentCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadAgent() {
      setAgentFetchLoading(true);
      setAgentFetchError(null);
      try {
        const res = await fetch(`${BACKEND_URL}/config/public`);
        if (!res.ok) throw new Error(`Agent not configured (${res.status})`);
        const data = (await res.json()) as { agentPublicKey?: string; error?: string };
        const addr = data.agentPublicKey?.trim() ?? "";
        if (!addr) throw new Error(data.error ?? "Agent address missing");
        // Validate as real pubkey and not zero/default
        const pk = new PublicKey(addr);
        if (pk.equals(PublicKey.default)) throw new Error("Agent address is zero");
        if (!cancelled) setAgentFetched(pk.toBase58());
      } catch (e) {
        if (!cancelled) setAgentFetchError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setAgentFetchLoading(false);
      }
    }
    loadAgent();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolved agent used for submission: auto-fetched if available, otherwise manual input
  const agent = agentFetched ?? manualAgent;
  const agentFetchFailed = !agentFetchLoading && agentFetchError !== null;

  // Step 2
  const [perTxSol, setPerTxSol] = useState("0.1");
  const [windowSol, setWindowSol] = useState("1");
  const [windowValue, setWindowValue] = useState("1");
  const [windowUnit, setWindowUnit] = useState<WindowUnit>("days");
  const [delayPreset, setDelayPreset] = useState<DelayPreset>("30m");
  const [customDelayValue, setCustomDelayValue] = useState("30");
  const [customDelayUnit, setCustomDelayUnit] = useState<WindowUnit>("minutes");
  const [recipients, setRecipients] = useState<string[]>([""]);

  // Step 3
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ signature: string; policy: string } | null>(null);

  const agentError = useMemo(() => {
    const v = agent.trim();
    if (!v) return "Enter the agent wallet address";
    try {
      const pk = new PublicKey(v);
      if (pk.equals(PublicKey.default)) return "Agent cannot be the zero address";
      if (owner && pk.toBase58() === owner) return "Agent must be different from your wallet";
      return null;
    } catch {
      return "Invalid public key";
    }
  }, [agent, owner]);

  const perTx = useMemo(() => parseSol(perTxSol), [perTxSol]);
  const windowLim = useMemo(() => parseSol(windowSol), [windowSol]);

  const crossLimitError = useMemo(() => {
    if (perTx.lamports !== null && windowLim.lamports !== null) {
      if (perTx.lamports > windowLim.lamports) return "Per-transaction limit must be at most the window limit";
    }
    return null;
  }, [perTx.lamports, windowLim.lamports]);

  const windowSeconds = useMemo(() => {
    const n = Number(windowValue);
    if (!windowValue.trim() || !Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
    const secs = n * WINDOW_UNIT_SECONDS[windowUnit];
    if (secs <= 0 || secs > 2_147_483_647) return null;
    return secs;
  }, [windowValue, windowUnit]);

  const windowError = useMemo(() => {
    if (windowSeconds === null) return "Enter a positive whole number";
    return null;
  }, [windowSeconds]);

  const withdrawDelaySeconds = useMemo(() => {
    if (delayPreset !== "custom") return DELAY_PRESET_SECONDS[delayPreset];
    const n = Number(customDelayValue);
    if (!customDelayValue.trim() || !Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
    const secs = n * WINDOW_UNIT_SECONDS[customDelayUnit];
    if (secs < 1 || secs > 604800) return null;
    return secs;
  }, [delayPreset, customDelayValue, customDelayUnit]);

  const delayError = useMemo(() => {
    if (withdrawDelaySeconds === null) return "Enter 1 second to 7 days";
    return null;
  }, [withdrawDelaySeconds]);

  const recipientErrors = useMemo(() => {
    return recipients.map((r) => {
      const t = r.trim();
      if (!t) return null; // empty row is allowed but ignored; will filter
      if (!isValidPubkey(t)) return "Invalid address";
      return null;
    });
  }, [recipients]);

  const duplicateRecipient = useMemo(() => {
    const seen = new Set<string>();
    for (const r of recipients) {
      const t = r.trim();
      if (!t) continue;
      const low = t;
      if (seen.has(low)) return "Duplicate recipient";
      seen.add(low);
    }
    return null;
  }, [recipients]);

  const filteredRecipients = useMemo(() => {
    return recipients.map((r) => r.trim()).filter((r) => r.length > 0);
  }, [recipients]);

  const step1Valid = !agentError && !!owner;
  const step2Valid =
    perTx.error === null &&
    windowLim.error === null &&
    crossLimitError === null &&
    windowError === null &&
    delayError === null &&
    recipientErrors.every((e) => e === null) &&
    duplicateRecipient === null &&
    filteredRecipients.length <= 10;

  const canSubmit = step1Valid && step2Valid && confirmed && !submitting;

  function updateRecipient(idx: number, value: string) {
    setRecipients((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  }

  function addRecipient() {
    if (recipients.length >= 10) return;
    setRecipients((prev) => [...prev, ""]);
  }

  function removeRecipient(idx: number) {
    setRecipients((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleCreate() {
    setError(null);
    if (!wallet.publicKey) {
      setError("Connect a wallet to create a policy");
      return;
    }
    if (!canSubmit) return;

    // Re-parse to ensure types
    let agentPk: PublicKey;
    try {
      agentPk = new PublicKey(agent.trim());
    } catch {
      setError("Invalid agent address");
      return;
    }

    const perTxLamports = perTx.lamports!;
    const windowLamports = windowLim.lamports!;
    const ws = windowSeconds!;
    const wd = withdrawDelaySeconds!;

    let recipientPks: PublicKey[] = [];
    try {
      recipientPks = filteredRecipients.map((r) => new PublicKey(r));
    } catch {
      setError("One recipient address is invalid");
      return;
    }

    setSubmitting(true);
    try {
      const res = await createPolicy(wallet, {
        agent: agentPk,
        perTxLimit: perTxLamports,
        windowLimit: windowLamports,
        windowSeconds: ws,
        withdrawDelaySeconds: wd,
        allowedRecipients: recipientPks,
      });
      setResult({ signature: res.signature, policy: res.policy.toBase58() });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Try to extract Anchor error code for nicer message
      const code =
        (e as { error?: { errorCode?: { code?: string } } })?.error?.errorCode?.code ??
        (e as { code?: string })?.code ??
        null;
      // Heuristic: if message contains a known code name, use it
      const knownCodes = [
        "InvalidPolicyConfig",
        "RecipientListFull",
        "DuplicateRecipient",
        "InvalidRecipient",
      ];
      let explain: string | null = null;
      for (const c of knownCodes) if (msg.includes(c)) explain = explainError(c);
      setError(explain ? `${explain} (${msg})` : code ? `${explainError(code)} (${msg})` : msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6">
        <div className="rounded-panel border border-line bg-panel p-6 sm:p-8">
          <h1 className="font-display text-[1.625rem] font-semibold text-paper">Policy created</h1>
          <p className="mt-2 max-w-[60ch] text-muted">
            Your policy is live on devnet. Fund the vault to let the agent pay.
          </p>

          <dl className="mt-6 space-y-4">
            <div>
              <dt className="text-[0.8125rem] font-semibold text-muted">Signature</dt>
              <dd className="mt-1 break-all font-mono text-[0.8125rem] text-paper">{result.signature}</dd>
              <a
                href={`https://explorer.solana.com/tx/${result.signature}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex text-[0.8125rem] font-semibold text-leash hover:underline"
              >
                View on Solana Explorer
              </a>
            </div>
            <div>
              <dt className="text-[0.8125rem] font-semibold text-muted">Policy address</dt>
              <dd className="mt-1 break-all font-mono text-[0.8125rem] text-paper">{result.policy}</dd>
              <a
                href={`https://explorer.solana.com/address/${result.policy}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex text-[0.8125rem] font-semibold text-leash hover:underline"
              >
                View policy on Explorer
              </a>
            </div>
          </dl>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={`/dashboard?policy=${result.policy}`}
              className="inline-flex min-h-11 items-center justify-center rounded-control bg-leash-strong px-5 text-[0.9375rem] font-semibold text-on-accent"
            >
              Go to dashboard
            </Link>
            <Link
              href="/create"
              onClick={() => setResult(null)}
              className="inline-flex min-h-11 items-center justify-center rounded-control border border-line px-5 text-[0.9375rem] font-semibold text-paper"
            >
              Create another
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-[2.25rem] font-semibold leading-none text-paper">Create policy</h1>
        <p className="mt-2 max-w-[60ch] text-muted">
          Set spending rules once. Solana enforces them on every payment.
        </p>
      </div>

      {/* Stepper — docs/design.md section 7 */}
      <ol className="mb-6 flex items-center gap-2" aria-label="Progress">
        {[1, 2, 3].map((n) => {
          const active = step === n;
          const done = step > n;
          return (
            <li key={n} className="flex items-center gap-2">
              <span
                className={
                  done
                    ? "inline-flex h-7 w-7 items-center justify-center rounded-pill bg-allowed text-[0.8125rem] font-semibold text-ink"
                    : active
                      ? "inline-flex h-7 w-7 items-center justify-center rounded-pill bg-leash-strong text-[0.8125rem] font-semibold text-on-accent"
                      : "inline-flex h-7 w-7 items-center justify-center rounded-pill border border-line bg-panel text-[0.8125rem] font-semibold text-muted"
                }
                aria-current={active ? "step" : undefined}
              >
                {n}
              </span>
              <span
                className={
                  active ? "text-[0.9375rem] font-semibold text-paper" : "text-[0.9375rem] text-muted"
                }
              >
                {n === 1 ? "Agent" : n === 2 ? "Rules" : "Review"}
              </span>
              {n < 3 && <span aria-hidden className="mx-2 hidden h-px w-8 bg-line sm:block" />}
            </li>
          );
        })}
      </ol>

      <div className="rounded-panel border border-line bg-panel p-5 sm:p-6">
        {!owner && (
          <p role="alert" className="mb-4 rounded-control border border-blocked/30 bg-blocked/10 px-3 py-2 text-[0.9375rem] text-blocked [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
            Connect a wallet to create a policy. Your wallet will be the policy owner.
          </p>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-display text-[1.25rem] font-semibold text-paper">Agent wallet</h2>
            <p className="max-w-[60ch] text-[0.9375rem] text-muted">
              SpendGuard automatically uses the backend&apos;s configured agent to sign{" "}
              <span className="font-mono text-paper">agent_transfer</span>. You don&apos;t need to find it yourself.
            </p>

            {agentFetchLoading && (
              <div className="rounded-control border border-line bg-ink px-4 py-3">
                <p className="text-[0.9375rem] text-muted">Loading agent address…</p>
              </div>
            )}

            {!agentFetchLoading && agentFetched && (
              <div className="space-y-2">
                <span className="block text-[0.8125rem] font-semibold text-paper">Configured agent address</span>
                <div className="flex gap-2">
                  <div className="flex-1 break-all rounded-control border border-line bg-ink px-3 py-2 font-mono text-[0.8125rem] text-paper">
                    {agentFetched}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(agentFetched);
                        setAgentCopied(true);
                        setTimeout(() => setAgentCopied(false), 1500);
                      } catch {
                        // ignore
                      }
                    }}
                    className="inline-flex min-h-11 items-center justify-center rounded-control border border-line bg-ink px-4 text-[0.8125rem] font-semibold text-paper"
                  >
                    {agentCopied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="text-[0.8125rem] text-muted">
                  This address matches the backend signing keypair for <span className="font-mono">agent_transfer</span>.
                </p>
                {agentError && (
                  <span role="alert" className="block text-[0.8125rem] text-blocked [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
                    {agentError}
                  </span>
                )}
              </div>
            )}

            {agentFetchFailed && (
              <div className="space-y-3 rounded-control border border-blocked/30 bg-blocked/10 px-4 py-3">
                <p role="alert" className="text-[0.9375rem] font-semibold text-blocked [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
                  Could not load the configured agent address — {agentFetchError}
                </p>
                <p className="text-[0.8125rem] text-muted">
                  You can enter the agent address manually. Ask the operator for the backend&apos;s agent public key, or
                  retry by reloading the page.
                </p>
                <label className="block">
                  <span className="mb-1 block text-[0.8125rem] font-semibold text-paper">Agent public key (manual)</span>
                  <input
                    value={manualAgent}
                    onChange={(e) => setManualAgent(e.target.value)}
                    placeholder="e.g. 9W3k…"
                    spellCheck={false}
                    autoComplete="off"
                    className="w-full rounded-control border border-line bg-ink px-3 py-2 font-mono text-[0.875rem] text-paper placeholder:text-muted focus:border-leash focus:outline-none"
                  />
                  {manualAgent.trim() && agentError && (
                    <span role="alert" className="mt-1 block text-[0.8125rem] text-blocked [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
                      {agentError}
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setAgentFetchError(null);
                    setAgentFetchLoading(true);
                    // retry fetch by toggling state — simplest is reload via fetch again
                    fetch(`${BACKEND_URL}/config/public`)
                      .then(async (res) => {
                        if (!res.ok) throw new Error(`Agent not configured (${res.status})`);
                        const data = (await res.json()) as { agentPublicKey?: string };
                        const addr = data.agentPublicKey?.trim() ?? "";
                        if (!addr) throw new Error("Agent address missing");
                        const pk = new PublicKey(addr);
                        if (pk.equals(PublicKey.default)) throw new Error("Agent address is zero");
                        setAgentFetched(pk.toBase58());
                        setAgentFetchError(null);
                      })
                      .catch((e) => setAgentFetchError(e instanceof Error ? e.message : String(e)))
                      .finally(() => setAgentFetchLoading(false));
                  }}
                  className="inline-flex min-h-11 items-center justify-center rounded-control border border-line px-4 text-[0.8125rem] font-semibold text-paper"
                >
                  Retry
                </button>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <span className="text-[0.8125rem] text-muted">
                Owner: <span className="font-mono text-paper">{owner ? shortAddr(owner) : "not connected"}</span>
              </span>
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!step1Valid}
                className="inline-flex min-h-11 items-center justify-center rounded-control bg-leash-strong px-5 text-[0.9375rem] font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h2 className="font-display text-[1.25rem] font-semibold text-paper">Spending rules</h2>

            {/* Limits */}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[0.8125rem] font-semibold text-paper">Per-transaction limit</span>
                <div className="relative">
                  <input
                    value={perTxSol}
                    onChange={(e) => setPerTxSol(e.target.value)}
                    placeholder="0.1"
                    inputMode="decimal"
                    className="w-full rounded-control border border-line bg-ink px-3 py-2 pr-12 text-[0.9375rem] text-paper placeholder:text-muted focus:border-leash focus:outline-none"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[0.8125rem] font-semibold text-muted">
                    SOL
                  </span>
                </div>
                <span className="mt-1 block text-[0.8125rem] text-muted">
                  {perTx.lamports !== null ? `${perTx.lamports.toString()} lamports` : "—"}
                </span>
                {perTx.error && (
                  <span role="alert" className="mt-1 block text-[0.8125rem] text-blocked [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
                    {perTx.error}
                  </span>
                )}
              </label>

              <label className="block">
                <span className="mb-1 block text-[0.8125rem] font-semibold text-paper">Window limit</span>
                <div className="relative">
                  <input
                    value={windowSol}
                    onChange={(e) => setWindowSol(e.target.value)}
                    placeholder="1"
                    inputMode="decimal"
                    className="w-full rounded-control border border-line bg-ink px-3 py-2 pr-12 text-[0.9375rem] text-paper placeholder:text-muted focus:border-leash focus:outline-none"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[0.8125rem] font-semibold text-muted">
                    SOL
                  </span>
                </div>
                <span className="mt-1 block text-[0.8125rem] text-muted">
                  {windowLim.lamports !== null ? `${windowLim.lamports.toString()} lamports` : "—"}
                </span>
                {windowLim.error && (
                  <span role="alert" className="mt-1 block text-[0.8125rem] text-blocked [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
                    {windowLim.error}
                  </span>
                )}
              </label>
            </div>
            {crossLimitError && (
              <p role="alert" className="text-[0.8125rem] text-blocked [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
                {crossLimitError}
              </p>
            )}

            {/* Window length */}
            <label className="block">
              <span className="mb-1 block text-[0.8125rem] font-semibold text-paper">Window length</span>
              <div className="flex gap-2">
                <input
                  value={windowValue}
                  onChange={(e) => setWindowValue(e.target.value)}
                  inputMode="numeric"
                  className="w-32 rounded-control border border-line bg-ink px-3 py-2 text-[0.9375rem] text-paper placeholder:text-muted focus:border-leash focus:outline-none"
                />
                <select
                  value={windowUnit}
                  onChange={(e) => setWindowUnit(e.target.value as WindowUnit)}
                  className="rounded-control border border-line bg-ink px-3 py-2 text-[0.9375rem] text-paper focus:border-leash focus:outline-none"
                >
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </div>
              <span className="mt-1 block text-[0.8125rem] text-muted">
                {windowSeconds !== null ? `${windowSeconds} seconds` : "—"}
              </span>
              {windowError && (
                <span role="alert" className="mt-1 block text-[0.8125rem] text-blocked [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
                  {windowError}
                </span>
              )}
            </label>

            {/* Withdrawal delay */}
            <fieldset className="space-y-2">
              <legend className="text-[0.8125rem] font-semibold text-paper">Withdrawal delay</legend>
              <div className="flex flex-wrap gap-2">
                {(["30m", "1h", "24h", "custom"] as DelayPreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDelayPreset(preset)}
                    className={
                      delayPreset === preset
                        ? "rounded-pill bg-leash-strong px-4 py-1.5 text-[0.8125rem] font-semibold text-on-accent"
                        : "rounded-pill border border-line bg-ink px-4 py-1.5 text-[0.8125rem] font-semibold text-paper"
                    }
                    aria-pressed={delayPreset === preset}
                  >
                    {preset === "30m" ? "30 minutes" : preset === "1h" ? "1 hour" : preset === "24h" ? "24 hours" : "Custom"}
                  </button>
                ))}
              </div>

              {delayPreset === "custom" && (
                <div className="flex gap-2 pt-1">
                  <input
                    value={customDelayValue}
                    onChange={(e) => setCustomDelayValue(e.target.value)}
                    inputMode="numeric"
                    className="w-32 rounded-control border border-line bg-ink px-3 py-2 text-[0.9375rem] text-paper focus:border-leash focus:outline-none"
                  />
                  <select
                    value={customDelayUnit}
                    onChange={(e) => setCustomDelayUnit(e.target.value as WindowUnit)}
                    className="rounded-control border border-line bg-ink px-3 py-2 text-[0.9375rem] text-paper focus:border-leash focus:outline-none"
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                </div>
              )}
              <span className="block text-[0.8125rem] text-muted">
                {withdrawDelaySeconds !== null ? `${withdrawDelaySeconds} seconds` : "—"}
              </span>
              {delayError && (
                <span role="alert" className="block text-[0.8125rem] text-blocked [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
                  {delayError}
                </span>
              )}
            </fieldset>

            {/* Recipients */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[0.8125rem] font-semibold text-paper">Recipients (up to 10)</span>
                <button
                  type="button"
                  onClick={addRecipient}
                  disabled={recipients.length >= 10}
                  className="inline-flex min-h-8 items-center justify-center rounded-control border border-line bg-ink px-3 text-[0.8125rem] font-semibold text-paper disabled:opacity-60"
                >
                  Add recipient
                </button>
              </div>
              <p className="text-[0.8125rem] text-muted">Recipients can be added but never removed.</p>

              {recipients.map((r, idx) => (
                <div key={idx} className="flex gap-2">
                  <div className="flex-1">
                    <input
                      value={r}
                      onChange={(e) => updateRecipient(idx, e.target.value)}
                      placeholder="Public key"
                      spellCheck={false}
                      className="w-full rounded-control border border-line bg-ink px-3 py-2 font-mono text-[0.8125rem] text-paper placeholder:text-muted focus:border-leash focus:outline-none"
                    />
                    {recipientErrors[idx] && (
                      <span role="alert" className="mt-1 block text-[0.8125rem] text-blocked [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
                        {recipientErrors[idx]}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRecipient(idx)}
                    className="inline-flex h-[38px] items-center justify-center rounded-control border border-line px-3 text-[0.8125rem] font-semibold text-paper"
                    aria-label={`Remove recipient ${idx + 1}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {duplicateRecipient && (
                <p role="alert" className="text-[0.8125rem] text-blocked [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
                  {duplicateRecipient}
                </p>
              )}
              {recipients.length >= 10 && (
                <p className="text-[0.8125rem] text-muted">Maximum 10 recipients reached.</p>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex min-h-11 items-center justify-center rounded-control border border-line px-5 text-[0.9375rem] font-semibold text-paper"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={!step2Valid}
                className="inline-flex min-h-11 items-center justify-center rounded-control bg-leash-strong px-5 text-[0.9375rem] font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <h2 className="font-display text-[1.25rem] font-semibold text-paper">Review</h2>

            <dl className="space-y-3 divide-y divide-line rounded-control border border-line bg-ink p-4">
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-[0.8125rem] text-muted">Owner</dt>
                <dd className="break-all font-mono text-[0.8125rem] text-paper">{owner ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-[0.8125rem] text-muted">Agent</dt>
                <dd className="break-all font-mono text-[0.8125rem] text-paper">{agent.trim() || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-[0.8125rem] text-muted">Per-transaction limit</dt>
                <dd className="text-[0.9375rem] font-semibold text-paper">
                  {perTx.lamports !== null ? `${lamportsToSol(perTx.lamports)} SOL` : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-[0.8125rem] text-muted">Window limit</dt>
                <dd className="text-[0.9375rem] font-semibold text-paper">
                  {windowLim.lamports !== null ? `${lamportsToSol(windowLim.lamports)} SOL` : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-[0.8125rem] text-muted">Window length</dt>
                <dd className="text-[0.9375rem] text-paper">
                  {windowSeconds !== null ? `${windowSeconds} seconds` : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-[0.8125rem] text-muted">Withdrawal delay</dt>
                <dd className="text-[0.9375rem] text-paper">
                  {withdrawDelaySeconds !== null ? `${withdrawDelaySeconds} seconds` : "—"}
                </dd>
              </div>
              <div className="py-2">
                <dt className="mb-1 text-[0.8125rem] text-muted">Recipients ({filteredRecipients.length})</dt>
                {filteredRecipients.length === 0 ? (
                  <dd className="text-[0.9375rem] text-muted">No recipients — you can add them later</dd>
                ) : (
                  <ul className="space-y-1">
                    {filteredRecipients.map((r) => (
                      <li key={r} className="break-all font-mono text-[0.8125rem] text-paper">
                        {r}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </dl>

            <label className="flex gap-3 rounded-control border border-line bg-ink p-3">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1 h-4 w-4 accent-leash"
              />
              <span className="text-[0.9375rem] leading-5 text-paper">
                I understand these rules cannot be changed, and recipients can only be added, never removed.
              </span>
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-control border border-blocked/30 bg-blocked/10 px-3 py-2 text-[0.9375rem] text-blocked [overflow-wrap:anywhere] break-words whitespace-pre-wrap"
              >
                {error}
              </p>
            )}

            <div className="flex justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={submitting}
                className="inline-flex min-h-11 items-center justify-center rounded-control border border-line px-5 text-[0.9375rem] font-semibold text-paper disabled:opacity-60"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!canSubmit}
                className="inline-flex min-h-11 items-center justify-center rounded-control bg-leash-strong px-5 text-[0.9375rem] font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Creating policy…" : "Create policy"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
