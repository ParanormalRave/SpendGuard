import { PreviewPanel } from "./PreviewPanel";

type StepProps = {
  number: number;
  title: string;
  text: string;
  rows: { label: string; value?: string; tone?: "white" | "green" | "orange" | "muted" }[];
};

function StepCard({ number, title, text, rows }: StepProps) {
  return (
    <li className="flex flex-col sm:contents lg:flex lg:flex-col">
      {/* On mobile (<640px) the circle sits on the vertical line via parent layout.
          On desktop the circle sits above the card. We render one circle; the
          responsive wrappers handle placement. */}
      <div className="flex gap-4 sm:contents lg:block">
        <div
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#34E08F] bg-[#0A111B] max-sm:mt-0"
        >
          <span
            className="text-[14px] font-medium text-[#34E08F]"
            style={{ fontFamily: "var(--font-jetbrains-landing)" }}
          >
            {number}
          </span>
        </div>

        <div className="flex-1 sm:contents lg:block">
          <div className="rounded-[14px] border border-[#223044] bg-[#0E1722]/90 p-6 lg:mt-4">
            <h3
              className="text-[22px] font-semibold leading-tight text-[#E8EEF5]"
              style={{ fontFamily: "var(--font-inter-landing)" }}
            >
              {title}
            </h3>
            <p
              className="mt-2 text-[16px] leading-[1.5] text-[#9DB0C4]"
              style={{ fontFamily: "var(--font-inter-landing)" }}
            >
              {text}
            </p>
            <div className="mt-5">
              <PreviewPanel rows={rows} />
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

export function HowItWorksSection() {
  return (
    <section id="how" className="w-full bg-[#0A111B] pt-[104px] pb-[88px]">
      <div className="mx-auto w-full max-w-[1160px] px-4 sm:px-6">
        <h2
          className="text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#E8EEF5] lg:text-[48px]"
          style={{ fontFamily: "var(--font-inter-landing)" }}
        >
          How it works
        </h2>

        <div className="relative mt-[72px]">
          {/* Horizontal line behind circles — desktop only (>=1024px), fades right */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-0 right-0 top-[22px] hidden h-px bg-[#2D4258] lg:block"
            style={{
              maskImage: "linear-gradient(to right, black 82%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to right, black 82%, transparent 100%)",
            }}
          />

          {/* Vertical line for mobile single-column — sits on left edge under circles */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 left-[22px] top-[22px] w-px bg-[#2D4258] sm:hidden"
          />

          <ol className="grid list-none grid-cols-1 items-start gap-6 p-0 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
            <StepCard
              number={1}
              title="Create a policy"
              text="Choose the per-payment limit, the window limit, and which addresses can be paid. The withdrawal delay is fixed at creation."
              rows={[
                { label: "Per payment", value: "0.05 SOL", tone: "white" },
                { label: "Window limit", value: "0.2 SOL", tone: "white" },
                { label: "Recipients", value: "3", tone: "white" },
              ]}
            />
            <StepCard
              number={2}
              title="Fund the vault"
              text="Send SOL to the vault. Only the program can move it. No other key can bypass the policy."
              rows={[
                { label: "Vault", value: "0.20 SOL", tone: "white" },
                { label: "Moved by", value: "Program only", tone: "white" },
                { label: "Other keys", value: "No access", tone: "orange" },
              ]}
            />
            <StepCard
              number={3}
              title="The agent pays within your rules"
              text="Each payment is checked on chain for amount, window and allowlist. Outside the rules, the transaction is rejected."
              rows={[
                { label: "0.03 SOL", value: "Approved", tone: "green" },
                { label: "0.09 SOL", value: "Blocked", tone: "orange" },
                { label: "Over the 0.05 limit", tone: "muted" },
              ]}
            />
            <StepCard
              number={4}
              title="You stay in control"
              text="Pause the agent, add recipients, or withdraw with a delay. You can cancel before it unlocks."
              rows={[
                { label: "Pause agent", value: "Off", tone: "white" },
                { label: "Withdraw", value: "Delayed", tone: "white" },
                { label: "Cancel", value: "Before unlock", tone: "green" },
              ]}
            />
          </ol>
        </div>

        <p
          className="mt-10 text-[13px] leading-5 text-[#9DB0C4]"
          style={{ fontFamily: "var(--font-inter-landing)" }}
        >
          Illustrative sequence, not wallet data.
        </p>
      </div>
    </section>
  );
}
