"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { fetchPolicyView, getVaultBalanceLamports, listPoliciesByOwner, type PolicyView } from "@/lib/chain";
import { readStoredPolicyAddress, writeStoredPolicyAddress } from "@/lib/policyStore";
import { lamportsToSol } from "@/lib/money";
import { formatCountdown } from "@/lib/countdown";
import { PageHeading } from "@/components/ui/PageHeading";
import { DataPanel, DataPanelBody } from "@/components/ui/DataPanel";
import { StateView } from "@/components/ui/StateView";
import { SpendingGauge } from "./SpendingGauge";
import { PolicyPicker } from "./PolicyPicker";
import { DepositAction, PauseAction } from "./PolicyActions";
import { CopyIcon, CheckIcon, BlockIcon } from "@/components/ui/Icons";

function shortAddr(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

const POLL_MS = 30_000;

export function DashboardClient() {
  const wallet = useWallet();
  const owner = wallet.publicKey;
  const searchParams = useSearchParams();
  const router = useRouter();

  const queryPolicy = searchParams.get("policy");

  const [policies, setPolicies] = useState<PolicyView[] | null>(null);
  const [policiesError, setPoliciesError] = useState<string | null>(null);
  const [activePolicy, setActivePolicy] = useState<PolicyView | null>(null);
  const [activeAddr, setActiveAddr] = useState<string | null>(null);
  const [vaultBalance, setVaultBalance] = useState<bigint | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [loadingPolicy, setLoadingPolicy] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Resolve active address: ?policy= → localStorage → first owned (validated to belong to wallet)
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
        // fall through
      }
    }
    return null;
  }, [queryPolicy]);

  const selectPolicy = useCallback(
    (addr: string) => {
      setActiveAddr(addr);
      writeStoredPolicyAddress(addr);
      const params = new URLSearchParams(searchParams.toString());
      params.set("policy", addr);
      router.replace(`/dashboard?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  // List owned policies
  useEffect(() => {
    if (!owner) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset owned list when wallet disconnects
      setPolicies(null);
      setPoliciesError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setPoliciesError(null);
      try {
        const list = await listPoliciesByOwner(owner);
        if (cancelled) return;
        setPolicies(list);
        // If no active addr yet, pick first owned
        if (!resolvedActiveAddr && list.length > 0) {
          const first = list[0]!.address.toBase58();
          setActiveAddr(first);
          writeStoredPolicyAddress(first);
          const params = new URLSearchParams(searchParams.toString());
          params.set("policy", first);
          router.replace(`/dashboard?${params.toString()}`, { scroll: false });
        } else if (resolvedActiveAddr) {
          // Validate stored/query addr is actually owned
          const owned = list.some((p) => p.address.toBase58() === resolvedActiveAddr);
          if (!owned) {
            // Do not display another wallet's policy — keep no selection, show invalid state
            setActiveAddr(null);
            setActivePolicy(null);
            setPolicyError(
              `Policy ${shortAddr(resolvedActiveAddr)} does not belong to the connected wallet. Select one of your policies.`
            );
          } else {
            setActiveAddr(resolvedActiveAddr);
          }
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setPoliciesError(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- owner + resolvedActiveAddr are the keys; searchParams identity is unstable
  }, [owner?.toBase58() ?? null, resolvedActiveAddr]);

  // Initialize activeAddr from resolved on mount / when policies arrive
  useEffect(() => {
    if (resolvedActiveAddr && !activeAddr) {
      // Will be validated against policies above; optimistically set
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seed active addr from URL/storage
      if (policies === null) setActiveAddr(resolvedActiveAddr);
    }
  }, [resolvedActiveAddr, activeAddr, policies]);

  // Fetch active policy + vault balance (on-chain source of truth, polled)
  useEffect(() => {
    const addr = activeAddr ?? resolvedActiveAddr;
    if (!addr || !owner) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear active policy when addr/owner missing
      setActivePolicy(null);
      setVaultBalance(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function load() {
      setLoadingPolicy(true);
      setPolicyError(null);
      setVaultError(null);
      try {
        const policyAddr = addr as string;
        const pk = new PublicKey(policyAddr);
        const policy = await fetchPolicyView(pk);
        if (cancelled) return;
        // Enforce ownership: fetched policy must belong to connected wallet
        if (!policy.owner.equals(owner!)) {
          setActivePolicy(null);
          setPolicyError(`Policy ${shortAddr(policyAddr)} does not belong to the connected wallet.`);
          setVaultBalance(null);
          return;
        }
        setActivePolicy(policy);
        try {
          const bal = await getVaultBalanceLamports(pk);
          if (!cancelled) setVaultBalance(bal);
        } catch (e) {
          if (!cancelled) setVaultError(e instanceof Error ? e.message : String(e));
        }
      } catch (e) {
        if (!cancelled) {
          setActivePolicy(null);
          setVaultBalance(null);
          setPolicyError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoadingPolicy(false);
      }
    }

    load();
    timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [activeAddr, resolvedActiveAddr, owner, refreshNonce]);

  // Disconnected
  if (!owner) {
    return (
      <div className="space-y-6">
        <PageHeading
          title="Dashboard"
          description="Connect a wallet to see your policies. On-chain data is the source of truth."
          action={
            <Link
              href="/create"
              className="inline-flex min-h-11 items-center justify-center rounded-control bg-leash-strong px-5 text-[0.9375rem] font-semibold text-on-accent"
            >
              Create policy
            </Link>
          }
        />
        <StateView
          variant="empty"
          title="No wallet connected"
          description="Connect a wallet to load policies from the chain."
        />
      </div>
    );
  }

  // Policies loading
  if (policies === null && !policiesError) {
    return (
      <div className="space-y-6">
        <PageHeading title="Dashboard" description="Loading your policies from the chain…" />
        <StateView variant="loading" title="Loading policies…" description="Reading Policy accounts filtered by your wallet." />
      </div>
    );
  }

  if (policiesError) {
    return (
      <div className="space-y-6">
        <PageHeading title="Dashboard" description="Your policies and spending overview." />
        <StateView
          variant="unavailable"
          title="Policies are not available"
          description={`Could not load policies from the RPC: ${policiesError}`}
        />
      </div>
    );
  }

  if (policies !== null && policies.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeading
          title="Dashboard"
          description="You have no policies yet. Create one to get started."
          action={
            <Link
              href="/create"
              className="inline-flex min-h-11 items-center justify-center rounded-control bg-leash-strong px-5 text-[0.9375rem] font-semibold text-on-accent"
            >
              Create policy
            </Link>
          }
        />
        <StateView
          variant="empty"
          title="No policies yet"
          description="Create a policy to set spending rules. The policy address will be saved for next time."
          action={
            <Link
              href="/create"
              className="inline-flex min-h-11 items-center justify-center rounded-control border border-line px-5 text-[0.9375rem] font-semibold text-paper"
            >
              Create policy
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" id="policies">
      {/* 1. Welcome — exact spec copy */}
      <section aria-labelledby="welcome-heading">
        <PageHeading
          title="Your wallet. Your rules. Your control."
          description="Set spending limits, enforce wallet policies, and stay in control of your Solana assets."
          action={
            <Link
              href="/create"
              className="inline-flex min-h-11 items-center justify-center rounded-control bg-leash-strong px-5 text-[0.9375rem] font-semibold text-on-accent"
            >
              Create policy
            </Link>
          }
        />
      </section>

      <PolicyPicker
        policies={policies ?? []}
        activeAddress={activeAddr ?? resolvedActiveAddr}
        onSelect={selectPolicy}
      />

      {policyError ? (
        <StateView variant="unavailable" title="Policy not available" description={policyError} />
      ) : null}

      {loadingPolicy && !activePolicy ? (
        <StateView variant="loading" title="Loading policy…" description="Reading the Policy account and vault balance." />
      ) : null}

      {activePolicy ? (
        <>
          {/* 2. Spending overview — prominent gauge + derived remaining */}
          <DataPanel>
            <DataPanelBody className="space-y-4">
              <h2 id="spending-overview-heading" className="font-display text-[1.125rem] font-semibold text-paper">
                Spending overview
              </h2>
              <SpendingGauge
                spent={activePolicy.spentInWindow}
                limit={activePolicy.windowLimit}
                perTxLimit={activePolicy.perTxLimit}
                windowStart={activePolicy.windowStart}
                windowSeconds={activePolicy.windowSeconds}
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat
                  label="Remaining in window"
                  value={`${lamportsToSol(activePolicy.windowLimit - activePolicy.spentInWindow)} SOL`}
                />
                <Stat label="Per payment limit" value={`${lamportsToSol(activePolicy.perTxLimit)} SOL`} />
                <Stat
                  label="Vault balance"
                  value={
                    vaultError !== null
                      ? `Unavailable — ${vaultError}`
                      : vaultBalance === null
                        ? "Loading…"
                        : `${lamportsToSol(vaultBalance)} SOL`
                  }
                  mono={vaultError === null && vaultBalance !== null}
                />
              </div>
            </DataPanelBody>
          </DataPanel>

          {/* 3. Spending analytics — honest placeholder, no fake bars */}
          <DataPanel>
            <DataPanelBody className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-[1.125rem] font-semibold text-paper">Spending analytics</h2>
                <div className="flex gap-2">
                  {["7d", "30d", "All"].map((label) => (
                    <button
                      key={label}
                      type="button"
                      disabled
                      title="Chart not available — no backend history yet"
                      className="inline-flex min-h-11 items-center justify-center rounded-pill border border-line px-4 text-[0.8125rem] font-semibold text-muted opacity-60"
                    >
                      {label === "7d" ? "Last 7 days" : label === "30d" ? "Last 30 days" : "All time"}
                    </button>
                  ))}
                </div>
              </div>
              <StateView
                variant="unavailable"
                title="Analytics not available yet"
                description="Spending history needs the backend payments index. This panel will show real on-chain spending once that data is available — no sample chart is shown as real."
              />
            </DataPanelBody>
          </DataPanel>

          {/* 4. Active policy panel (existing read-only card) */}
          <DashboardPolicyCard policy={activePolicy} vaultBalance={vaultBalance} vaultError={vaultError} />

          {activePolicy.paused ? (
            <div role="alert" className="rounded-control border border-blocked/40 bg-blocked-wash px-4 py-3 text-[0.9375rem] font-semibold text-blocked [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
              Agent paused. No payments can go through.
            </div>
          ) : null}

          {/* Management actions — deposit + pause/resume (IDL-verified) */}
          <div className="grid gap-6 lg:grid-cols-2">
            <DepositAction policy={activePolicy} vaultBalance={vaultBalance} onDone={() => setRefreshNonce((n) => n + 1)} />
            <PauseAction policy={activePolicy} onDone={() => setRefreshNonce((n) => n + 1)} />
          </div>

          {/* 5. Recent activity — teaser, honest unavailable until activity task */}
          <DataPanel>
            <DataPanelBody className="space-y-3">
              <h2 className="font-display text-[1.125rem] font-semibold text-paper">Recent activity</h2>
              <StateView
                variant="unavailable"
                title="Activity is not available yet"
                description="Recent payments, blocked attempts and alerts will appear here once the activity page is complete. No transactions are fabricated."
                action={
                  <Link
                    href="/activity"
                    className="inline-flex min-h-11 items-center justify-center rounded-control border border-line px-5 text-[0.9375rem] font-semibold text-paper"
                  >
                    Go to activity
                  </Link>
                }
              />
            </DataPanelBody>
          </DataPanel>

          {/* 6. Quick actions — only real routes */}
          <DataPanel>
            <DataPanelBody className="space-y-3">
              <h2 className="font-display text-[1.125rem] font-semibold text-paper">Quick actions</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Link
                  href="/create"
                  className="flex min-h-11 items-center justify-center rounded-control bg-leash-strong px-4 text-[0.9375rem] font-semibold text-on-accent"
                >
                  Create policy
                </Link>
                <a
                  href={`https://explorer.solana.com/address/${activePolicy.address.toBase58()}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-11 items-center justify-center rounded-control border border-line px-4 text-[0.9375rem] font-semibold text-paper"
                >
                  View policy on Explorer
                </a>
                <Link
                  href="/activity?tab=alerts"
                  className="flex min-h-11 items-center justify-center rounded-control border border-line px-4 text-[0.9375rem] font-semibold text-paper"
                >
                  View alerts
                </Link>
                <Link
                  href="/activity?tab=payments"
                  className="flex min-h-11 items-center justify-center rounded-control border border-line px-4 text-[0.9375rem] font-semibold text-paper"
                >
                  View transactions
                </Link>
              </div>
            </DataPanelBody>
          </DataPanel>

          <section id="policies-list" className="space-y-3">
            <h2 className="font-display text-[1.125rem] font-semibold text-paper">Your policies</h2>
            <div className="divide-y divide-line rounded-panel border border-line bg-panel">
              {policies!.map((p) => {
                const addr = p.address.toBase58();
                const active = activeAddr === addr || resolvedActiveAddr === addr;
                return (
                  <button
                    key={addr}
                    type="button"
                    onClick={() => selectPolicy(addr)}
                    className={`flex w-full items-center justify-between gap-4 px-4 py-3 text-left ${active ? "bg-leash-wash" : "hover:bg-surface-raised"}`}
                  >
                    <span className="font-mono text-[0.8125rem] text-paper">{shortAddr(addr)}</span>
                    <span className="flex items-center gap-2 text-[0.8125rem] text-muted">
                      {p.paused ? <BlockIcon size={16} /> : <CheckIcon size={16} />}
                      {p.paused ? "Paused" : "Active"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </>
      ) : !loadingPolicy && !policyError ? (
        <StateView variant="empty" title="Select a policy" description="Choose a policy from the picker above to see its limits and spending." />
      ) : null}
    </div>
  );
}

function DashboardPolicyCard({
  policy,
  vaultBalance,
  vaultError,
}: {
  policy: PolicyView;
  vaultBalance: bigint | null;
  vaultError: string | null;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  }

  const vaultText =
    vaultError !== null
      ? `Unavailable — ${vaultError}`
      : vaultBalance === null
        ? "Loading…"
        : `${lamportsToSol(vaultBalance)} SOL`;

  // Distinct: 0 is legitimate, null/unavailable is not shown as 0
  const hasPending = policy.pendingAmount > 0n;

  return (
    <DataPanel>
      <DataPanelBody className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-[1.25rem] font-semibold text-paper">Active policy</h2>
              <span
                className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[0.8125rem] font-semibold ${policy.paused ? "bg-blocked-wash text-blocked" : "bg-allowed-wash text-allowed"}`}
              >
                {policy.paused ? <BlockIcon size={14} /> : <CheckIcon size={14} />}
                {policy.paused ? "Paused" : "Active"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => copy(policy.address.toBase58())}
              className="mt-1 inline-flex items-center gap-1 font-mono text-[0.8125rem] text-muted hover:text-paper"
              aria-label={`Copy policy address ${policy.address.toBase58()}`}
            >
              {shortAddr(policy.address.toBase58())}
              <CopyIcon size={14} />
              {copied === policy.address.toBase58() ? "Copied" : ""}
            </button>
          </div>
          <a
            href={`https://explorer.solana.com/address/${policy.address.toBase58()}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center rounded-control border border-line px-4 text-[0.9375rem] font-semibold text-paper"
          >
            View on Explorer
          </a>
        </div>

        <SpendingGauge
          spent={policy.spentInWindow}
          limit={policy.windowLimit}
          perTxLimit={policy.perTxLimit}
          windowStart={policy.windowStart}
          windowSeconds={policy.windowSeconds}
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Per payment" value={`${lamportsToSol(policy.perTxLimit)} SOL`} />
          <Stat label="Window limit" value={`${lamportsToSol(policy.windowLimit)} SOL`} />
          <Stat label="Spent in window" value={`${lamportsToSol(policy.spentInWindow)} SOL`} />
          <Stat label="Vault balance" value={vaultText} mono={vaultError === null && vaultBalance !== null} />
        </div>

        <div className="grid gap-2 text-[0.8125rem]">
          <div className="flex justify-between gap-4">
            <span className="text-muted">Agent</span>
            <button
              type="button"
              onClick={() => copy(policy.agent.toBase58())}
              className="inline-flex items-center gap-1 break-all font-mono text-paper hover:text-leash"
            >
              {shortAddr(policy.agent.toBase58())} <CopyIcon size={14} />
            </button>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted">Window</span>
            <span className="tabular text-paper">
              {policy.windowSeconds.toString()} seconds · started {new Date(Number(policy.windowStart) * 1000).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted">Withdraw delay</span>
            <span className="text-paper">{policy.withdrawDelaySeconds.toString()} seconds</span>
          </div>
        </div>

        <div>
          <h3 className="text-[0.8125rem] font-semibold text-paper">Recipients ({policy.allowedCount} of 10)</h3>
          <p className="mt-1 text-[0.8125rem] text-muted">Recipients can be added but never removed.</p>
          {policy.allowedRecipients.length === 0 ? (
            <p className="mt-2 text-[0.9375rem] text-muted">No recipients yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-control border border-line bg-ink">
              {policy.allowedRecipients.map((r) => {
                const addr = r.toBase58();
                return (
                  <li key={addr} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="break-all font-mono text-[0.8125rem] text-paper">{addr}</span>
                    <button
                      type="button"
                      onClick={() => copy(addr)}
                      aria-label={`Copy recipient ${addr}`}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border border-line text-paper"
                    >
                      <CopyIcon size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {hasPending ? (
          <div className="rounded-control border border-caution/40 bg-caution-wash px-4 py-3">
            <p className="text-[0.9375rem] font-semibold text-paper">Pending withdrawal</p>
            <p className="mt-1 font-mono text-[0.8125rem] text-paper">
              {lamportsToSol(policy.pendingAmount)} SOL · unlocks {formatCountdown(policy.pendingUnlockAt)} ·{" "}
              <span className="font-sans text-muted">{new Date(Number(policy.pendingUnlockAt) * 1000).toLocaleString()}</span>
            </p>
            <p className="mt-2 text-[0.8125rem] text-muted">
              Withdrawal actions (cancel, release) land in the next dashboard task — this card is read-only for now.
            </p>
          </div>
        ) : null}
      </DataPanelBody>
    </DataPanel>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-control border border-line bg-surface-sunken px-3 py-3">
      <div className="text-[0.8125rem] text-muted">{label}</div>
      <div className={`mt-1 text-[0.9375rem] font-semibold text-paper ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
