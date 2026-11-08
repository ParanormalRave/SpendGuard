"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  ActivityIcon,
  BellIcon,
  DashboardIcon,
  PoliciesIcon,
  SettingsIcon,
} from "@/components/ui/Icons";

interface SidebarProps {
  onNavigate?: () => void;
  onOpenSettings: () => void;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", Icon: DashboardIcon },
  { href: "/dashboard#policies", label: "Policies", Icon: PoliciesIcon },
  { href: "/activity?tab=alerts", label: "Alerts", Icon: BellIcon },
  { href: "/activity?tab=payments", label: "Transactions", Icon: ActivityIcon },
] as const;

function useHash(): string {
  const [hash, setHash] = useState("");
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return hash;
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hash = useHash();
  const tab = searchParams.get("tab");

  function isActive(href: string): boolean {
    if (href === "/dashboard") return pathname === "/dashboard" && hash !== "#policies";
    if (href === "/dashboard#policies") return pathname === "/dashboard" && hash === "#policies";
    if (href === "/activity?tab=alerts") return pathname === "/activity" && tab === "alerts";
    if (href === "/activity?tab=payments") return pathname === "/activity" && tab === "payments";
    return pathname === href;
  }

  return (
    <>
      {navItems.map(({ href, label, Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "flex min-h-11 items-center gap-3 rounded-control border-l-2 border-leash bg-leash-wash px-3 text-[0.9375rem] font-semibold text-paper"
                : "flex min-h-11 items-center gap-3 rounded-control px-3 text-[0.9375rem] font-semibold text-muted hover:bg-panel hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leash focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
            }
          >
            <Icon size={18} aria-hidden />
            {label}
          </Link>
        );
      })}
    </>
  );
}

export function Sidebar({ onNavigate, onOpenSettings }: SidebarProps) {
  return (
    <nav aria-label="Primary" className="flex h-full flex-col">
      <Link
        href="/"
        onClick={onNavigate}
        className="flex min-h-11 items-center gap-2 rounded-control px-2 text-paper"
        aria-label="SpendGuard home"
      >
        <span className="inline-flex h-8 w-8 shrink-0 overflow-hidden rounded-chip">
          {/* eslint-disable-next-line @next/next/no-img-element -- local JPEG named .png, next/image would re-optimize; keep original appearance */}
          <img
            src="/images/spendguard-logo.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 object-cover"
          />
        </span>
        <span className="font-display text-[1.125rem] font-semibold">SpendGuard</span>
      </Link>

      <div className="mt-6 flex flex-col gap-1">
        <Suspense fallback={null}>
          <SidebarNav onNavigate={onNavigate} />
        </Suspense>

        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            onOpenSettings();
          }}
          className="flex min-h-11 items-center gap-3 rounded-control px-3 text-left text-[0.9375rem] font-semibold text-muted hover:bg-panel hover:text-paper"
        >
          <SettingsIcon size={18} aria-hidden />
          Settings
        </button>
      </div>

      <div className="mt-auto border-t border-line pt-4">
        <Link
          href="/create"
          onClick={onNavigate}
          className="flex min-h-11 items-center justify-center rounded-control bg-leash-strong px-4 text-[0.9375rem] font-semibold text-on-accent"
        >
          Create policy
        </Link>
      </div>
    </nav>
  );
}
