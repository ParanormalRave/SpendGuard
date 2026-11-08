import { BlockIcon } from "@/components/ui/Icons";
import { Section } from "./Section";

export function ProblemSection() {
  return (
    <Section id="problem" variant="panel">
      <h2 className="font-display text-[1.625rem] font-semibold text-paper sm:text-[2rem]">Giving an AI agent a wallet is risky.</h2>
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="rounded-panel border border-blocked/30 bg-blocked-wash p-5">
          <h3 className="flex items-center gap-2 text-[0.9375rem] font-semibold text-paper">
            <span className="text-blocked"><BlockIcon size={16} /></span> Full access
          </h3>
          <p className="mt-2 text-[0.9375rem] leading-6 text-paper">
            One bug or one hidden instruction and the funds are gone. The agent can spend anything once it holds the key.
          </p>
        </div>
        <div className="rounded-panel border border-blocked/30 bg-blocked-wash p-5">
          <h3 className="flex items-center gap-2 text-[0.9375rem] font-semibold text-paper">
            <span className="text-blocked"><BlockIcon size={16} /></span> Off-chain limits
          </h3>
          <p className="mt-2 text-[0.9375rem] leading-6 text-paper">
            The same code that is under attack is the code enforcing the limits. If it is tricked, the limits disappear.
          </p>
        </div>
      </div>
      <p className="mt-6 text-[1rem] font-semibold text-paper">SpendGuard moves the rules into the blockchain.</p>
      <p className="mt-1 text-[0.6875rem] text-muted">Illustrative comparison, not live data.</p>
    </Section>
  );
}
