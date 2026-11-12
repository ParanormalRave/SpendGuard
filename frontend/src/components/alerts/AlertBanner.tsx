"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAlertsContext } from "./AlertsProvider";

export function AlertBanner() {
  const { ownerAlerts, isRead, markRead } = useAlertsContext();

  const critical = useMemo(() => {
    const unreadCritical = ownerAlerts.filter((a) => a.severity === "critical" && !isRead(a.dedupeKey));
    if (unreadCritical.length === 0) return null;
    // newest first per API; pick most recent unread critical
    const sorted = [...unreadCritical].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const top = sorted[0];
    if (!top) return null;
    // Ignore if a later WITHDRAWAL_CANCELLED or WITHDRAWAL_EXECUTED exists for same policy
    const topTime = new Date(top.createdAt).getTime();
    const hasLaterCancelOrExec = ownerAlerts.some(
      (a) =>
        a.policy === top.policy &&
        (a.type === "WITHDRAWAL_CANCELLED" || a.type === "WITHDRAWAL_EXECUTED") &&
        new Date(a.createdAt).getTime() > topTime,
    );
    if (hasLaterCancelOrExec) return null;
    return top;
  }, [ownerAlerts, isRead]);

  if (!critical) return null;

  return (
    <div role="alert" className="flex items-center justify-between gap-3 bg-blocked px-4 py-3 text-[0.8125rem] font-semibold text-ink sm:px-6 [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
      <span>
        {critical.title}: {critical.message}
      </span>
      <span className="flex shrink-0 gap-2">
        <Link href={`/dashboard?policy=${critical.policy}`} className="rounded-control bg-ink px-3 py-1.5 text-paper">
          Go to dashboard
        </Link>
        <button type="button" onClick={() => markRead(critical.dedupeKey)} className="rounded-control border border-ink/20 px-3 py-1.5 text-ink">
          Dismiss
        </button>
      </span>
    </div>
  );
}
