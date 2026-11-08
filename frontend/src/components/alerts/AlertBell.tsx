"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BellIcon } from "@/components/ui/Icons";
import { useAlertsContext } from "./AlertsProvider";

function severityDot(severity: string): string {
  if (severity === "critical") return "bg-blocked";
  if (severity === "warning") return "bg-caution";
  return "bg-muted";
}

export function AlertBell() {
  const { ownerAlerts, unreadCount, isRead, markAllRead } = useAlertsContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={unreadCount > 0 ? `${unreadCount} unread alerts` : "No unread alerts"}
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border border-line bg-panel text-muted"
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-blocked px-1 text-[0.6875rem] font-bold text-ink">
            {unreadCount > 9 ? "9+" : String(unreadCount)}
          </span>
        ) : null}
      </button>

      {open ? (
        <div role="dialog" aria-label="Alerts" className="absolute right-0 top-12 z-20 w-80 rounded-panel border border-line bg-panel p-3 shadow-panel sm:w-96">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-display text-[0.9375rem] font-semibold text-paper">Alerts</span>
            <span className="text-[0.6875rem] text-muted">{unreadCount} unread</span>
          </div>

          {ownerAlerts.length === 0 ? (
            <p className="py-6 text-center text-[0.8125rem] text-muted">No alerts yet.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-auto">
              {ownerAlerts.map((a) => {
                const unread = !isRead(a.dedupeKey);
                return (
                  <li key={a.dedupeKey} className={`flex gap-2 py-2 ${unread ? "" : "opacity-60"}`}>
                    <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-pill ${severityDot(a.severity)}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.8125rem] font-semibold text-paper">
                        {a.title} <span className="font-normal text-muted">· {a.severity}</span>
                      </p>
                      <p className="text-[0.6875rem] text-muted">{a.message}</p>
                      <p className="text-[0.6875rem] text-muted">{new Date(a.createdAt).toLocaleString()}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-3 flex gap-2">
            {unreadCount > 0 ? (
              <button type="button" onClick={markAllRead} className="inline-flex min-h-8 items-center rounded-control border border-line px-3 text-[0.6875rem] font-semibold text-paper">
                Mark all read
              </button>
            ) : null}
            <Link href="/activity?tab=alerts" onClick={() => setOpen(false)} className="inline-flex min-h-8 items-center rounded-control bg-leash-strong px-3 text-[0.6875rem] font-semibold text-ink">
              View all
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
