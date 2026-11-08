"use client";

import type { PolicyView } from "@/lib/chain";

function shortAddr(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function PolicyPicker({
  policies,
  activeAddress,
  onSelect,
}: {
  policies: PolicyView[];
  activeAddress: string | null;
  onSelect: (address: string) => void;
}) {
  if (policies.length === 0) return null;

  return (
    <label className="block">
      <span className="mb-1 block text-[0.8125rem] font-semibold text-muted">Policy</span>
      <select
        value={activeAddress ?? ""}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full rounded-control border border-line bg-ink px-3 py-2 font-mono text-[0.8125rem] text-paper focus:border-leash focus:outline-none"
      >
        {policies.map((p) => {
          const addr = p.address.toBase58();
          return (
            <option key={addr} value={addr}>
              {shortAddr(addr)} · {p.allowedCount} recipients · {p.paused ? "Paused" : "Active"}
            </option>
          );
        })}
      </select>
    </label>
  );
}
