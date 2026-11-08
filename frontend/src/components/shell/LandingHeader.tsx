"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";

const ConnectButton = dynamic(() => import("@/components/ConnectButton").then((m) => m.ConnectButton), {
  ssr: false,
  loading: () => (
    <div aria-hidden className="h-11 w-[9.5rem] rounded-control border border-line bg-panel" />
  ),
});

export function LandingHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-2 rounded-control text-paper"
          aria-label="SpendGuard home"
        >
          <span className="inline-flex h-8 w-8 shrink-0 overflow-hidden rounded-chip">
            <Image
              src="/images/spendguard-logo.png"
              alt="SpendGuard"
              width={32}
              height={32}
              className="h-8 w-8 object-cover"
            />
          </span>
          <span className="font-display text-[1.25rem] font-semibold">SpendGuard</span>
        </Link>
        <nav aria-label="In-page" className="hidden items-center gap-4 md:flex">
          <a href="#how-it-works" className="text-[0.8125rem] font-semibold text-muted hover:text-paper">How it works</a>
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden items-center rounded-pill border border-line px-3 py-1 text-[0.8125rem] font-semibold text-muted sm:inline-flex">
            Devnet
          </span>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
