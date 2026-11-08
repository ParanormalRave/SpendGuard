"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

// The wallet button reads browser-only wallet state, so it is loaded on the
// client only. The placeholder matches its size to avoid a layout shift and a
// hydration mismatch.
const ConnectButton = dynamic(() => import("./ConnectButton").then((m) => m.ConnectButton), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden="true"
      className="h-11 w-[9.5rem] rounded-control border border-line bg-panel"
    />
  ),
});

/** Top bar: tether mark, wordmark, devnet pill, wallet button (design.md section 6). */
export function Header() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-2 rounded-control text-paper"
          aria-label="SpendGuard home"
        >
          <span aria-hidden="true" className="h-0.5 w-5 bg-leash" />
          <span className="font-display text-[1.25rem] font-semibold">SpendGuard</span>
        </Link>

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
