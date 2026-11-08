"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SpendingGauge } from "@/components/dashboard/SpendingGauge";
import { BlockIcon } from "@/components/ui/Icons";

const SAMPLE_SPENT = 120_000_000n;
const SAMPLE_LIMIT = 200_000_000n;
const SAMPLE_PER_TX = 50_000_000n;
const SAMPLE_WINDOW_SECONDS = 86_400n;

export function HeroSection() {
  const [windowStart, setWindowStart] = useState<bigint>(0n);
  useEffect(() => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const remaining = 5n * 3600n + 12n * 60n;
    setWindowStart(now - (SAMPLE_WINDOW_SECONDS - remaining));
  }, []);

  return (
    <section className="bg-ink py-12 sm:py-16">
      <div className="mx-auto grid w-full max-w-[1120px] gap-10 px-4 sm:gap-12 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-16 lg:py-20">
        <div className="flex flex-col">
          <h1 className="max-w-[14ch] font-display text-[2.25rem] font-semibold leading-[0.95] tracking-[-0.02em] text-paper sm:text-[3rem] lg:text-[3.25rem]">Give your AI agent a wallet it can&apos;t abuse.</h1>
          <p className="mt-5 max-w-[42ch] text-[1.0625rem] leading-7 text-muted sm:mt-6 sm:text-[1.1875rem] sm:leading-8">Set spending rules once. Solana enforces them on every payment.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3 sm:mt-9">
            <Link href="/create" className="inline-flex min-h-11 items-center justify-center rounded-control bg-leash-strong px-7 py-3 text-[0.9375rem] font-semibold text-on-accent">Create a policy</Link>
            <Link href="/dashboard" className="inline-flex min-h-11 items-center justify-center rounded-control border border-line bg-transparent px-7 py-3 text-[0.9375rem] font-semibold text-paper">See a demo</Link>
          </div>
          <p className="mt-4 text-[0.8125rem] leading-5 text-muted">Devnet only. No real funds. Connect Phantom or Solflare to get started.</p>
        </div>
        <div className="flex justify-center lg:justify-end">
          <div className="w-full max-w-[420px] rounded-panel border border-line bg-panel p-6 shadow-panel sm:p-7">
            <div className="mb-3"><span className="inline-flex rounded-pill border border-line bg-surface-sunken px-2.5 py-1 text-[0.6875rem] font-semibold tracking-wide text-muted">Demo data — not your wallet</span></div>
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="font-display text-[1.25rem] font-semibold leading-none text-paper">Research agent</h2><p className="mt-1 text-[0.8125rem] text-muted">Sample policy — illustrative only</p></div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-allowed-wash px-2.5 py-1 text-[0.8125rem] font-semibold text-allowed"><span aria-hidden className="h-1.5 w-1.5 rounded-pill bg-allowed" />Active</span>
            </div>
            <div className="mt-6"><SpendingGauge spent={SAMPLE_SPENT} limit={SAMPLE_LIMIT} perTxLimit={SAMPLE_PER_TX} windowStart={windowStart} windowSeconds={SAMPLE_WINDOW_SECONDS} /></div>
            <div className="mt-5 flex items-start gap-2.5 rounded-control border border-blocked/30 bg-blocked-wash px-3.5 py-2.5">
              <span className="mt-0.5 shrink-0 text-blocked"><BlockIcon size={16} /></span>
              <p className="text-[0.8125rem] leading-5 text-paper">Blocked: the agent tried to pay an address that is not on your list.<span className="ml-1 text-muted">(sample)</span></p>
            </div>
            <p className="mt-3 text-center text-[0.6875rem] leading-4 text-muted">Sample spending 0.12 of 0.20 SOL · sample limit marker at 0.05 SOL</p>
          </div>
        </div>
      </div>
    </section>
  );
}
