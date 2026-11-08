"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { MenuIcon } from "@/components/ui/Icons";
import { AlertBell } from "@/components/alerts/AlertBell";

const ConnectButton = dynamic(() => import("@/components/ConnectButton").then((m) => m.ConnectButton), {
  ssr: false,
  loading: () => (
    <div aria-hidden className="h-11 w-[9.5rem] rounded-control border border-line bg-panel" />
  ),
});

function pageTitle(pathname: string): string {
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname.startsWith("/activity")) return "Activity";
  if (pathname.startsWith("/create")) return "Create policy";
  return "SpendGuard";
}

export function TopBar({
  onOpenMenu,
  onOpenAlerts,
}: {
  onOpenMenu: () => void;
  onOpenAlerts?: () => void;
}) {
  const pathname = usePathname();
  const title = pageTitle(pathname);

  return (
    <header className="flex h-[64px] shrink-0 items-center justify-between gap-4 border-b border-line bg-ink px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border border-line text-paper lg:hidden"
        >
          <MenuIcon />
        </button>
        <h1 className="font-display text-[1.125rem] font-semibold text-paper">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden items-center rounded-pill border border-line px-3 py-1 text-[0.8125rem] font-semibold text-muted sm:inline-flex">
          Devnet
        </span>

        <AlertBell />

        <ConnectButton />
      </div>
    </header>
  );
}
