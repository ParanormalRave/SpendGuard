import Link from "next/link";

function PlayIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M3.5 2.8L11.2 7L3.5 11.2V2.8Z" fill="#E8EEF5" />
    </svg>
  );
}

export function HeroContent() {
  return (
    <section className="relative z-10 mx-auto w-full max-w-[900px] px-4 pt-10 pb-8 text-center sm:px-6 sm:pt-16">
      <h1
        className="mx-auto text-[2.2rem] font-semibold leading-[0.95] tracking-[-0.035em] text-[#E8EEF5] sm:text-[3rem] lg:text-[68px]"
        style={{ fontFamily: "var(--font-schibsted)" }}
      >
        <span className="block">Give your AI agent a</span>
        <span
          className="block bg-clip-text text-transparent"
          style={{
            backgroundImage:
              "linear-gradient(90deg, #34E08F 0%, #33C5C4 50%, #2E8BFF 100%)",
          }}
        >
          wallet it can&apos;t abuse.
        </span>
      </h1>

      <p
        className="mx-auto mt-6 max-w-[52ch] text-[1.0625rem] leading-7 text-[#9DB0C4] sm:text-[20px] sm:leading-8"
        style={{ fontFamily: "var(--font-schibsted)" }}
      >
        Set spending rules once. Solana enforces them on every payment.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:mt-9">
        <Link
          href="/create"
          className="inline-flex min-h-11 items-center justify-center rounded-[10px] bg-[#34E08F] px-7 py-3 text-[0.9375rem] font-semibold text-[#06121C] hover:bg-[#2fd68a]"
        >
          Create a policy
        </Link>

        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-[#2D4258] bg-[#0E1722]/70 px-7 py-3 text-[0.9375rem] font-semibold text-[#E8EEF5] hover:bg-[#0E1722]"
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10">
            <PlayIcon />
          </span>
          See a demo
        </Link>
      </div>

      <p className="mt-5 text-[0.8125rem] leading-5 text-[#7F93A8]">
          
      </p>
    </section>
  );
}
