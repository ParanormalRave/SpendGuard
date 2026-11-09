import Image from "next/image";
import { CircleSlashIcon } from "./CircleSlashIcon";

type RiskCardProps = {
  title: string;
  text: string;
};

function RiskCard({ title, text }: RiskCardProps) {
  return (
    <div className="flex-1 rounded-[14px] border border-[#4A2A25] bg-[#1A1218] p-7">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
          <CircleSlashIcon />
        </span>
        <h3
          className="text-[20px] font-semibold leading-none text-white"
          style={{ fontFamily: "var(--font-inter-landing)" }}
        >
          {title}
        </h3>
      </div>
      <p
        className="mt-3 text-[17px] leading-[1.5] text-[#C9D3DD]"
        style={{ fontFamily: "var(--font-inter-landing)" }}
      >
        {text}
      </p>
    </div>
  );
}

export function RiskSection() {
  return (
    <section id="risk" className="w-full bg-[#0A111B] pt-[104px] pb-[72px]">
      <div className="mx-auto w-full max-w-[1160px] px-4 sm:px-6">
        <h2
          className="max-w-[640px] text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#E8EEF5] lg:text-[48px]"
          style={{ fontFamily: "var(--font-inter-landing)" }}
        >
          Giving an AI agent a wallet is risky.
        </h2>

        <div className="mt-12 flex flex-col gap-6 lg:flex-row">
          <RiskCard
            title="Full access"
            text="One bug or one hidden instruction and the funds are gone. The agent can spend anything once it holds the key."
          />
          <RiskCard
            title="Off-chain limits"
            text="The same code that is under attack is the code enforcing the limits. If it is tricked, the limits disappear."
          />
        </div>

        <div className="mt-10 flex items-center gap-3">
          <Image
            src="/spendguard-mark.svg"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0"
            aria-hidden="true"
          />
          <p
            className="text-[22px] font-semibold leading-tight text-[#34E08F] sm:text-[28px]"
            style={{ fontFamily: "var(--font-inter-landing)" }}
          >
            SpendGuard moves the rules into the blockchain.
          </p>
        </div>

        <p className="mt-3 text-[13px] leading-5 text-[#9DB0C4]" style={{ fontFamily: "var(--font-inter-landing)" }}>
          Illustrative comparison, not live data.
        </p>
      </div>
    </section>
  );
}
