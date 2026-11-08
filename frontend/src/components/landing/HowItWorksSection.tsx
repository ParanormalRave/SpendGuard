import { Section } from "./Section";

const STEPS = [
  {
    n: 1,
    title: "Create a policy",
    desc: "Choose the per-payment limit, the window limit, and which addresses can be paid. The withdrawal delay is fixed at creation.",
  },
  {
    n: 2,
    title: "Fund the vault",
    desc: "Send SOL to the vault. Only the program can move it. No other key can bypass the policy.",
  },
  {
    n: 3,
    title: "The agent pays within your rules",
    desc: "Each payment is checked on chain for amount, window and allowlist. Outside the rules, the transaction is rejected.",
  },
  {
    n: 4,
    title: "You stay in control",
    desc: "Pause the agent, add recipients, or withdraw with a delay. You can cancel before it unlocks.",
  },
];

export function HowItWorksSection() {
  return (
    <Section id="how-it-works" variant="ink">
      <h2 className="font-display text-[1.625rem] font-semibold text-paper sm:text-[2rem]">How it works</h2>
      <ol className="mt-8 grid gap-6 sm:grid-cols-2">
        {STEPS.map((s) => (
          <li key={s.n} className="rounded-panel border border-line bg-panel p-5">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-leash-strong text-[0.8125rem] font-semibold text-on-accent">{s.n}</span>
              <div>
                <h3 className="text-[0.9375rem] font-semibold text-paper">{s.title}</h3>
                <p className="mt-1 text-[0.9375rem] leading-6 text-muted">{s.desc}</p>
                <div className="mt-3 rounded-control border border-line bg-surface-sunken px-3 py-2 text-[0.6875rem] text-muted">Illustrative step {s.n}</div>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[0.6875rem] text-muted">Illustrative sequence, not wallet data.</p>
    </Section>
  );
}
