"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { listPoliciesByOwner, type PolicyView } from "@/lib/chain";
import { readStoredPolicyAddress } from "@/lib/policyStore";
import {
  fetchAttempts,
  fetchConfigPublic,
  fetchPayments,
  normalizeAttempt,
  runScenario,
  toBigIntSafe,
  type AttemptDto,
  type ConfigPublicDto,
  type NormalizedAttempt,
  type PaymentDto,
  type RunAgentResult,
} from "@/lib/api";
import { lamportsToSol } from "@/lib/money";
import { explainError } from "@/lib/errors";
import { PageHeading } from "@/components/ui/PageHeading";
import { StateView } from "@/components/ui/StateView";
import { DataPanel, DataPanelBody } from "@/components/ui/DataPanel";
import { BlockIcon, CheckIcon, InfoIcon } from "@/components/ui/Icons";

type Tab = "payments" | "blocked" | "alerts";

function shortAddr(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

const POLL_MS = 10_000;

export function ActivityClient() {
  const wallet = useWallet();
  const owner = wallet.publicKey;
  const searchParams = useSearchParams();
  const router = useRouter();

  const tabParam = searchParams.get("tab");
  const tab: Tab = tabParam === "blocked" || tabParam === "alerts" ? tabParam : "payments";

  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`/activity?${params.toString()}`, { scroll: false });
  };

  // Resolve active policy same as dashboard: ?policy= → storage → first owned
  const queryPolicy = searchParams.get("policy");
  const resolvedActiveAddr = useMemo(() => {
    if (queryPolicy) {
      try {
        const pk = new PublicKey(queryPolicy);
        if (!pk.equals(PublicKey.default)) return pk.toBase58();
      } catch {
        // fall through
      }
    }
    const stored = readStoredPolicyAddress();
    if (stored) {
      try {
        const pk = new PublicKey(stored);
        if (!pk.equals(PublicKey.default)) return pk.toBase58();
      } catch {
        // ignore
      }
    }
    return null;
  }, [queryPolicy]);

  const [policies, setPolicies] = useState<PolicyView[] | null>(null);
  const [policiesError, setPoliciesError] = useState<string | null>(null);
  const [activeAddr, setActiveAddr] = useState<string | null>(resolvedActiveAddr);

  // Keep activeAddr in sync when URL/storage changes
  useEffect(() => {
    if (resolvedActiveAddr && resolvedActiveAddr !== activeAddr) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync URL param to local active addr
      setActiveAddr(resolvedActiveAddr);
    }
  }, [resolvedActiveAddr, activeAddr]);

  useEffect(() => {
    if (!owner) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when wallet disconnects
      setPolicies(null);
      setPoliciesError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await listPoliciesByOwner(owner);
        if (!cancelled) setPolicies(list);
        // If no resolved addr, pick first owned (do not auto-navigate; just set local active)
        if (!resolvedActiveAddr && list.length > 0 && !activeAddr) {
          setActiveAddr(list[0]!.address.toBase58());
        }
      } catch (e) {
        if (!cancelled) setPoliciesError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, resolvedActiveAddr, activeAddr]);

  const activePolicy = useMemo(() => {
    const addr = activeAddr ?? resolvedActiveAddr;
    if (!addr || !policies) return null;
    return policies.find((p) => p.address.toBase58() === addr) ?? null;
  }, [activeAddr, resolvedActiveAddr, policies]);

  // Data for tabs — filtered strictly by active policy
  const [payments, setPayments] = useState<PaymentDto[] | null>(null);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<NormalizedAttempt[] | null>(null);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);
  const [alertsUnavailable, setAlertsUnavailable] = useState<string | null>(null);

  // Task 0.2: agent config policy vs active
  const [configPublic, setConfigPublic] = useState<ConfigPublicDto | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchConfigPublic()
      .then((cfg) => {
        if (!cancelled) setConfigPublic(cfg);
      })
      .catch(() => {
        if (!cancelled) setConfigPublic(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Scenario runner state
  const [running, setRunning] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<RunAgentResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const activeAddrStr = useMemo(
    () => activePolicy?.address.toBase58() ?? activeAddr ?? resolvedActiveAddr,
    [activePolicy, activeAddr, resolvedActiveAddr],
  );

  async function refetchActivity() {
    const addr = activeAddrStr;
    if (addr) {
      try {
        const data = await fetchPayments(addr);
        const filtered = data.filter((p) => p.policy === addr);
        setPayments(filtered);
        setPaymentsError(null);
      } catch (e) {
        setPaymentsError(e instanceof Error ? e.message : String(e));
      }
    }
    try {
      const data = await fetchAttempts(100);
      setAttempts(data.map(normalizeAttempt));
      setAttemptsError(null);
    } catch (e) {
      setAttemptsError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRun(scenario: string) {
    if (running) return;
    setRunError(null);
    setRunResult(null);
    setRunning(scenario);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await runScenario(scenario, { signal: controller.signal, timeoutMs: 90_000 });
      setRunResult(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if ((e as { name?: string })?.name === "AbortError" || msg.includes("aborted")) {
        setRunError("Request timed out after 90 seconds or was cancelled.");
      } else {
        setRunError(msg);
      }
    } finally {
      setRunning(null);
      abortRef.current = null;
      // Refetch immediately as required
      void refetchActivity();
    }
  }

  // Payments: polled, filtered by exact policy match (backend already scopes, but we re-filter)
  useEffect(() => {
    const addr = activePolicy?.address.toBase58() ?? activeAddr ?? resolvedActiveAddr;
    if (!addr) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear when no active policy
      setPayments(null);
      setPaymentsError(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const addrStr = addr as string;
    async function load() {
      try {
        const data = await fetchPayments(addrStr);
        if (cancelled) return;
        // Strict: keep only rows where payment.policy === active addr (no trust of stale index)
        const filtered = data.filter((p) => p.policy === addrStr);
        setPayments(filtered);
        setPaymentsError(null);
      } catch (e) {
        if (!cancelled) setPaymentsError(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [activePolicy?.address, activeAddr, resolvedActiveAddr]);

  // Attempts: global, so client-side strict filter by exact active policy; signature not required
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    async function load() {
      try {
        const data = await fetchAttempts(100);
        if (cancelled) return;
        setAttempts(data.map(normalizeAttempt));
        setAttemptsError(null);
      } catch (e) {
        if (!cancelled) setAttemptsError(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  const filteredAttempts = useMemo(() => {
    if (!attempts) return null;
    const addr = activePolicy?.address.toBase58() ?? activeAddr ?? resolvedActiveAddr;
    if (!addr) return [] as NormalizedAttempt[];
    // Never display entries without reliable policy association
    return attempts.filter((a) => a.policy && a.policy === addr);
  }, [attempts, activePolicy, activeAddr, resolvedActiveAddr]);

  const blockedAttempts = useMemo(() => {
    if (!filteredAttempts) return null;
    return filteredAttempts.filter((a) => a.status === "rejected");
  }, [filteredAttempts]);

  // Alerts tab — query by active policy (change 5)
  const [policyAlerts, setPolicyAlerts] = useState<import("@/lib/api").AlertDto[] | null>(null);
  const [policyAlertsError, setPolicyAlertsError] = useState<string | null>(null);
  useEffect(() => {
    const addr = activePolicy?.address.toBase58() ?? activeAddr ?? resolvedActiveAddr;
    if (!addr) {
      setPolicyAlerts(null);
      setPolicyAlertsError(null);
      setAlertsUnavailable(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    async function load() {
      try {
        const { fetchAlerts } = await import("@/lib/api");
        const res = await fetchAlerts({ policy: addr as string, limit: 100 });
        if (cancelled) return;
        setPolicyAlerts(res.alerts);
        setPolicyAlertsError(null);
        setAlertsUnavailable(null);
      } catch (e) {
        if (!cancelled) {
          setPolicyAlertsError(e instanceof Error ? e.message : String(e));
          setAlertsUnavailable(null);
        }
      }
    }
    load();
    // poll every 10s, pause when hidden
    timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      load();
    }, 10_000);
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [activePolicy?.address, activeAddr, resolvedActiveAddr]);

  // keep alertsUnavailable for compatibility — only set if fetch fails with 404 etc handled above
  useEffect(() => {
    if (tab !== "alerts") setAlertsUnavailable(null);
  }, [tab]);

  if (!owner) {
    return (
      <div className="space-y-6">
        <PageHeading
          title="Activity"
          description="Payments, blocked attempts, and alerts for the active policy."
        />
        <StateView
          variant="empty"
          title="No wallet connected"
          description="Connect a wallet to load activity for your policies."
        />
      </div>
    );
  }

  if (policies === null && !policiesError) {
    return (
      <div className="space-y-6">
        <PageHeading title="Activity" description="Loading your policies…" />
        <StateView variant="loading" title="Loading activity…" description="Reading your policies to scope activity to the active policy." />
      </div>
    );
  }

  if (policiesError) {
    return (
      <div className="space-y-6">
        <PageHeading title="Activity" description="Payments, blocked attempts, and alerts." />
        <StateView variant="unavailable" title="Activity not available" description={`Could not load policies: ${policiesError}`} />
      </div>
    );
  }

  if (policies && policies.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeading title="Activity" description="No policies yet — activity will appear after you create one." />
        <StateView
          variant="empty"
          title="No activity yet"
          description="Create a policy to see payments, blocked attempts, and alerts."
          action={
            <Link
              href="/create"
              className="inline-flex min-h-11 items-center justify-center rounded-control bg-leash-strong px-5 text-[0.9375rem] font-semibold text-on-accent"
            >
              Create policy
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title="Activity"
        description="Payments, blocked attempts, and alerts for the active policy. Strictly filtered — never shows another policy’s attempts."
      />

      {/* Policy scope hint */}
      <div className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted">
        <span>Active policy:</span>
        <span className="font-mono text-paper">{activePolicy ? shortAddr(activePolicy.address.toBase58()) : activeAddr ? shortAddr(activeAddr) : "—"}</span>
        {activePolicy ? (
          <span className="inline-flex items-center gap-1 rounded-pill bg-allowed-wash px-2 py-0.5 text-[0.6875rem] font-semibold text-allowed">
            <CheckIcon size={12} /> {activePolicy.paused ? "Paused" : "Active"}
          </span>
        ) : null}
      </div>

      {configPublic?.policyAddress &&
      activeAddrStr &&
      configPublic.policyAddress !== activeAddrStr ? (
        <div className="rounded-control border border-caution/30 bg-caution-wash px-3 py-2 text-[0.8125rem] text-paper">
          The agent is configured for policy {shortAddr(configPublic.policyAddress)}.{" "}
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("policy", configPublic.policyAddress!);
              router.replace(`/activity?${params.toString()}`, { scroll: false });
              setActiveAddr(configPublic.policyAddress);
            }}
            className="font-semibold text-leash hover:underline"
          >
            Switch to it
          </button>
          , or update POLICY_ADDRESS.
        </div>
      ) : null}

      <div className="flex gap-2" role="tablist" aria-label="Activity tabs">
        {(["payments", "blocked", "alerts"] as Tab[]).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t)}
              className={
                active
                  ? "inline-flex min-h-11 items-center justify-center rounded-pill bg-leash-strong px-5 text-[0.8125rem] font-semibold text-on-accent"
                  : "inline-flex min-h-11 items-center justify-center rounded-pill border border-line px-5 text-[0.8125rem] font-semibold text-paper hover:bg-panel"
              }
            >
              {t === "payments" ? "Payments" : t === "blocked" ? "Blocked" : "Alerts"}
            </button>
          );
        })}
      </div>

      {tab === "payments" && (
        <DataPanel>
          <DataPanelBody>
            {paymentsError ? (
              <StateView variant="unavailable" title="Payments not available" description={paymentsError} />
            ) : payments === null ? (
              <StateView variant="loading" title="Loading payments…" />
            ) : payments.length === 0 ? (
              <StateView variant="empty" title="No payments yet" description="Successful payments for the active policy will appear here with Explorer links." />
            ) : (
              <ul className="divide-y divide-line">
                {payments.map((p) => (
                  <li key={p.signature} className="flex items-start gap-3 py-3">
                    <span className="mt-0.5 text-allowed">
                      <CheckIcon size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.9375rem] text-paper">
                        Payment of {(() => { const v = toBigIntSafe((p as unknown as Record<string, unknown>).amountLamports ?? (p as unknown as Record<string, unknown>).amount_lamports); return v !== null ? `${lamportsToSol(v)} SOL` : "unknown amount"; })()} to {shortAddr(p.recipient)}
                      </p>
                      <p className="text-[0.8125rem] text-muted">{new Date(p.timestamp * 1000).toLocaleString()}</p>
                    </div>
                    <span className="shrink-0 rounded-pill bg-allowed-wash px-2 py-0.5 text-[0.6875rem] font-semibold text-allowed">Allowed</span>
                    <a
                      href={`https://explorer.solana.com/tx/${p.signature}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-[0.8125rem] font-semibold text-leash hover:underline"
                    >
                      Explorer
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </DataPanelBody>
        </DataPanel>
      )}

      {tab === "blocked" && (
        <DataPanel>
          <DataPanelBody>
            {attemptsError ? (
              <StateView variant="unavailable" title="Blocked attempts not available" description={attemptsError} />
            ) : blockedAttempts === null ? (
              <StateView variant="loading" title="Loading blocked attempts…" />
            ) : blockedAttempts.length === 0 ? (
              <StateView variant="empty" title="No blocked attempts for this policy" description="The agent’s rejected payments for the active policy will appear here. Global attempts from other policies are never shown." />
            ) : (
              <>
                <ul className="divide-y divide-line">
                  {blockedAttempts.map((a) => (
                    <li key={`${a.id ?? a.signature ?? a.timestamp}-${a.timestamp}`} className="flex items-start gap-3 py-3">
                      <span className="mt-0.5 text-blocked">
                        <BlockIcon size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.9375rem] text-paper">{a.errorCode ? explainError(a.errorCode) : "Blocked by spending rules"}</p>
                        <p className="text-[0.8125rem] text-muted">
                          {a.amountLamports !== null ? `${lamportsToSol(a.amountLamports)} SOL` : "unknown amount"} to {shortAddr(a.recipient)} · {a.scenario}
                          {a.reason ? ` · ${a.reason}` : ""}
                        </p>
                        <p className="text-[0.8125rem] text-muted">{a.timestamp !== null ? new Date(a.timestamp as number).toLocaleString() : ""}</p>
                      </div>
                      <span className="shrink-0 rounded-pill bg-blocked-wash px-2 py-0.5 text-[0.6875rem] font-semibold text-blocked">Blocked</span>
                      {a.signature ? (
                        <a
                          href={`https://explorer.solana.com/tx/${a.signature}?cluster=devnet`}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-[0.8125rem] font-semibold text-leash hover:underline"
                        >
                          Explorer
                        </a>
                      ) : (
                        <span className="shrink-0 text-[0.6875rem] text-muted">No signature — rejected off-chain</span>
                      )}
                    </li>
                  ))}
                </ul>
                {(() => {
                  const errorCount = filteredAttempts?.filter((a) => a.status === "error").length ?? 0;
                  return errorCount > 0 ? (
                    <p className="mt-3 text-[0.8125rem] text-muted">{errorCount} attempts failed for other reasons</p>
                  ) : null;
                })()}
              </>
            )}
          </DataPanelBody>
        </DataPanel>
      )}

      {tab === "alerts" && (
        <DataPanel>
          <DataPanelBody>
            {policyAlertsError ? (
              <StateView variant="unavailable" title="Alerts not available" description={policyAlertsError} />
            ) : alertsUnavailable ? (
              <StateView variant="unavailable" title="Alerts are not available yet" description={alertsUnavailable} />
            ) : policyAlerts === null ? (
              <StateView variant="loading" title="Loading alerts…" />
            ) : policyAlerts.length === 0 ? (
              <StateView variant="empty" title="No alerts yet" description="Security alerts for the active policy will appear here." />
            ) : (
              <ul className="divide-y divide-line">
                {policyAlerts.map((a) => (
                  <li key={a.dedupeKey} className="flex items-start gap-3 py-3">
                    <span
                      className={`mt-0.5 inline-flex h-2 w-2 shrink-0 rounded-pill ${a.severity === "critical" ? "bg-blocked" : a.severity === "warning" ? "bg-caution" : "bg-muted"}`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.9375rem] font-semibold text-paper">
                        {a.title} <span className="text-[0.6875rem] font-normal text-muted">· {a.severity}</span>
                      </p>
                      <p className="text-[0.8125rem] text-muted">{a.message}</p>
                      <p className="text-[0.6875rem] text-muted">{new Date(a.createdAt).toLocaleString()} · {a.type}</p>
                      {a.txSignature ? (
                        <a href={`https://explorer.solana.com/tx/${a.txSignature}?cluster=devnet`} target="_blank" rel="noreferrer" className="text-[0.6875rem] font-semibold text-leash hover:underline">
                          Explorer
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DataPanelBody>
        </DataPanel>
      )}

      <DataPanel>
        <DataPanelBody className="space-y-4">
          <h2 className="font-display text-[1.125rem] font-semibold text-paper">Scenario runner</h2>
          <p className="text-[0.8125rem] text-muted">Run an agent scenario against the active policy. Results are real attempts.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { id: "normal", label: "Normal", desc: "Valid payments within limits." },
              { id: "overspend", label: "Overspend", desc: "Tries to exceed per-tx and window limits." },
              { id: "injection", label: "Injection", desc: "Prompt-injected rogue-service payment." },
              { id: "unusual", label: "Unusual", desc: "Several small then one large payment.", disabled: true, note: "Coming soon" },
            ].map((s) => {
              const isRunning = running === s.id;
              const disabled = !!s.disabled || !!running;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleRun(s.id)}
                  className={`flex min-h-[64px] flex-col items-start justify-center rounded-control border px-4 py-3 text-left ${
                    disabled
                      ? "cursor-not-allowed border-line bg-panel/50 opacity-60"
                      : "border-line bg-panel hover:border-leash/50"
                  }`}
                >
                  <span className="text-[0.9375rem] font-semibold text-paper">
                    {s.label} {isRunning ? "— running…" : s.note ? `— ${s.note}` : ""}
                  </span>
                  <span className="text-[0.8125rem] text-muted">{s.desc}</span>
                </button>
              );
            })}
          </div>
          {running ? <p className="text-[0.8125rem] text-muted">Running {running}… up to 90 seconds. Do not close the tab.</p> : null}
          {runError ? <p className="rounded-control border border-blocked/30 bg-blocked-wash px-3 py-2 text-[0.8125rem] text-blocked">{runError}</p> : null}
          {runResult ? (
            <div className="space-y-3 rounded-control border border-line bg-surface-sunken p-3">
              <p className="text-[0.9375rem] font-semibold text-paper">Agent: {runResult.message || "(no message)"}</p>
              {runResult.reason ? <p className="text-[0.8125rem] text-muted">Reason: {runResult.reason}</p> : null}
              <p className="text-[0.8125rem] text-muted">Scenario {runResult.scenario} · {runResult.attempts.length} attempts</p>
              <ul className="divide-y divide-line">
                {runResult.attempts.map((raw, idx) => {
                  const a = normalizeAttempt(raw);
                  return (
                  <li key={`${a.signature ?? a.id ?? idx}-${a.timestamp}-${idx}`} className="flex items-start gap-2 py-2">
                    <span className={a.status === "success" ? "text-allowed" : a.status === "rejected" ? "text-blocked" : "text-caution"}>
                      {a.status === "success" ? <CheckIcon size={14} /> : a.status === "rejected" ? <BlockIcon size={14} /> : <InfoIcon size={14} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.8125rem] text-paper">
                        {a.status === "success" ? "Allowed" : a.status === "rejected" ? (a.errorCode ? explainError(a.errorCode) : "Rejected") : a.errorCode ? explainError(a.errorCode) : a.status} — {a.amountLamports !== null ? `${lamportsToSol(a.amountLamports)} SOL` : "unknown amount"} to {shortAddr(a.recipient)}
                      </p>
                      {a.reason ? <p className="text-[0.6875rem] text-muted">{a.reason}</p> : null}
                      {a.signature ? (
                        <a href={`https://explorer.solana.com/tx/${a.signature}?cluster=devnet`} target="_blank" rel="noreferrer" className="text-[0.6875rem] font-semibold text-leash hover:underline">
                          Explorer
                        </a>
                      ) : null}
                    </div>
                    <span className="shrink-0 rounded-pill bg-panel px-2 py-0.5 text-[0.6875rem] font-semibold text-muted">{a.status}</span>
                  </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </DataPanelBody>
      </DataPanel>
    </div>
  );
}
