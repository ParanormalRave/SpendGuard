import Link from "next/link";

export function CtaBand() {
  return (
    <section className="scroll-mt-[64px] bg-leash-wash py-12 sm:py-[72px]">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col items-center gap-4 px-4 text-center sm:px-6">
        <h2 className="font-display text-[1.625rem] font-semibold text-paper sm:text-[2rem]">Put your agent on a leash</h2>
        <p className="max-w-[42ch] text-[0.9375rem] leading-6 text-muted">Create a policy in a minute. Solana enforces it on every payment.</p>
        <div className="mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link href="/create" className="inline-flex min-h-11 items-center justify-center rounded-control bg-leash-strong px-7 py-3 text-[0.9375rem] font-semibold text-on-accent sm:w-auto">
            Create a policy
          </Link>
          <Link href="/dashboard" className="inline-flex min-h-11 items-center justify-center rounded-control border border-line bg-panel px-7 py-3 text-[0.9375rem] font-semibold text-paper sm:w-auto">
            See a demo
          </Link>
        </div>
      </div>
    </section>
  );
}
