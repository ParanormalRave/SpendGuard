"use client";

import { useEffect, useState } from "react";
import { lamportsToSol } from "@/lib/money";

function formatRemaining(remaining: number): string {
  if (remaining <= 0) return "Resets now";
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  if (h > 0) return `Resets in ${h}h ${m}m`;
  if (m > 0) return `Resets in ${m}m`;
  return `Resets in ${remaining}s`;
}

function useResetLabel(windowStart: bigint, windowSeconds: bigint): string {
  const [label, setLabel] = useState<string>(() => {
    // Initial (prerender) — static without Date.now to satisfy cacheComponents
    if (windowStart === 0n) return "Resets in 5h 12m";
    return "Resets in —";
  });
  useEffect(() => {
    if (windowStart === 0n) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- demo fallback label
      setLabel("Resets in 5h 12m");
      return;
    }
    const tick = () => {
      const now = BigInt(Math.floor(Date.now() / 1000));
      const end = windowStart + windowSeconds;
      const remaining = end > now ? Number(end - now) : 0;
      setLabel(formatRemaining(remaining));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [windowStart, windowSeconds]);
  return label;
}

export function SpendingGauge({
  spent,
  limit,
  perTxLimit,
  windowStart,
  windowSeconds,
}: {
  spent: bigint;
  limit: bigint;
  perTxLimit: bigint;
  windowStart: bigint;
  windowSeconds: bigint;
}) {
  const pct = limit > 0n ? Number((spent * 10000n) / limit) / 100 : 0;
  const clamped = Math.min(100, Math.max(0, pct));
  const perTxPct = limit > 0n ? Number((perTxLimit * 10000n) / limit) / 100 : 0;

  let fill = "bg-leash";
  if (pct >= 100) fill = "bg-blocked";
  else if (pct >= 80) fill = "bg-caution";

  const glow = pct >= 80 ? "shadow-glow" : "";

  const resetLabel = useResetLabel(windowStart, windowSeconds);

  return (
    <div>
      <div className={`relative h-3 overflow-hidden rounded-pill bg-surface-sunken ${glow}`}>
        <div className={`h-full rounded-pill ${fill} transition-[width] duration-200`} style={{ width: `${clamped}%` }} />
        {/* per-tx notch */}
        {perTxPct > 0 && perTxPct < 100 ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 h-full w-0.5 bg-paper/60"
            style={{ left: `${Math.min(100, perTxPct)}%` }}
          />
        ) : null}
      </div>
      <p className="mt-2 text-[0.9375rem] text-muted">
        <span className="tabular font-semibold text-paper">
          {lamportsToSol(spent)} of {lamportsToSol(limit)} SOL spent
        </span>
        <span className="mx-2 text-line">·</span>
        <span>{resetLabel}</span>
        <span className="mx-2 text-line">·</span>
        <span>Per payment {lamportsToSol(perTxLimit)} SOL</span>
      </p>
    </div>
  );
}
