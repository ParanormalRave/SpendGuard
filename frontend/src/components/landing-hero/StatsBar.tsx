type StatProps = {
  value: string;
  label: string;
};

function StatCell({ value, label }: StatProps) {
  return (
    <div className="px-4 py-5 text-center sm:px-6">
      <div
        className="text-[13px] font-medium tabular-nums text-[#E8EEF5] sm:text-[14px]"
        style={{ fontFamily: "var(--font-jetbrains-landing)" }}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] font-medium tracking-wide text-[#7F93A8] sm:text-[12px]">
        {label}
      </div>
    </div>
  );
}

export function StatsBar() {
  return (
    <div className="relative z-10 w-full border-t border-[#223044] bg-[#0A111B]/75 backdrop-blur">
      <div className="mx-auto w-full max-w-[1360px]">
        <div className="grid grid-cols-2 divide-x divide-y divide-[#223044] lg:grid-cols-4 lg:divide-y-0">
          <StatCell value="0.05 SOL" label="Per-payment limit" />
          <StatCell value="0.2 SOL" label="Daily cap" />
          <StatCell value="Allow-list" label="Approved recipients only" />
          <StatCell value="Devnet" label="Phantom or Solflare" />
        </div>
      </div>
    </div>
  );
}
