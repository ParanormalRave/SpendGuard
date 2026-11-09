import Link from "next/link";
import { PlayOutlineIcon } from "./PlayOutlineIcon";

function CtaGlow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative h-[160px] w-full overflow-hidden"
    >
      {/* faint blue radial behind arc */}
      <div
        className="absolute inset-x-0 bottom-0 h-[280px]"
        style={{
          background:
            "radial-gradient(ellipse 60% 85% at 50% 100%, #0F2A44 40%, transparent 72%)",
        }}
      />
      {/* arc SVG — 560px wide, top edge rises from bottom */}
      <svg
        width="560"
        height="280"
        viewBox="0 0 560 280"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute bottom-0 left-1/2 h-[160px] w-[560px] -translate-x-1/2"
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient id="cta-arc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2DD4BF" />
            <stop offset="100%" stopColor="#38BDF8" />
          </linearGradient>
          <filter id="cta-arc-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>
        {/* glow */}
        <path
          d="M 40 260 A 240 240 0 0 1 520 260"
          stroke="url(#cta-arc-grad)"
          strokeWidth="10"
          fill="none"
          opacity="0.45"
          filter="url(#cta-arc-glow)"
        />
        {/* sharp arc */}
        <path
          d="M 40 260 A 240 240 0 0 1 520 260"
          stroke="url(#cta-arc-grad)"
          strokeWidth="2"
          fill="none"
        />
      </svg>
    </div>
  );
}

export function CtaSection() {
  return (
    <section
      id="cta"
      className="w-full overflow-hidden bg-[#0A111B] pt-[112px] pb-0 text-center"
    >
      <div className="mx-auto w-full max-w-[1160px] px-4 sm:px-6">
        <h2
          className="mx-auto text-[38px] font-semibold leading-[1.02] tracking-[-0.03em] text-[#E8EEF5] lg:text-[56px]"
          style={{ fontFamily: "var(--font-inter-landing)" }}
        >
          Put your agent on a leash
        </h2>
        <p
          className="mx-auto mt-4 max-w-[440px] text-[20px] leading-7 text-[#9DB0C4]"
          style={{ fontFamily: "var(--font-inter-landing)" }}
        >
          Create a policy in a minute. Solana enforces it on every payment.
        </p>

        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Link
            href="/create"
            className="inline-flex h-[54px] w-full items-center justify-center rounded-[10px] bg-[#34E08F] px-7 text-[16px] font-semibold text-[#06210F] hover:bg-[#2fd68a] sm:w-auto"
          >
            Create a policy
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex h-[54px] w-full items-center justify-center gap-2 rounded-[10px] border border-[#2D4258] bg-[#0E1722] px-7 text-[16px] font-semibold text-[#E8EEF5] hover:bg-[#121d2d] sm:w-auto"
          >
            <PlayOutlineIcon />
            See a demo
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <CtaGlow />
      </div>
    </section>
  );
}
