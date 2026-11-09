type RowProps = {
  time: string;
  amount: string;
  recipient: string;
  status: "Approved" | "Blocked";
};

function LedgerRow({ time, amount, recipient, status }: RowProps) {
  const isApproved = status === "Approved";
  const statusColor = isApproved ? "#34E08F" : "#FF7A45";

  return (
    <div className="flex items-center gap-3 border-b border-[#223044]/70 px-5 py-4 last:border-b-0 sm:px-6">
      <span
        className="shrink-0 text-[13px] tabular-nums text-[#9DB0C4]"
        style={{ fontFamily: "var(--font-jetbrains-landing)" }}
      >
        {time}
      </span>

      <span
        className="shrink-0 text-[13px] font-medium tabular-nums text-[#E8EEF5]"
        style={{ fontFamily: "var(--font-jetbrains-landing)" }}
      >
        {amount}
      </span>

      <span
        className="min-w-0 flex-1 truncate text-left text-[13px] text-[#9DB0C4]"
        style={{ fontFamily: "var(--font-jetbrains-landing)" }}
        title={recipient}
      >
        {recipient}
      </span>

      <span
        className="shrink-0 text-[13px] font-medium"
        style={{
          fontFamily: "var(--font-jetbrains-landing)",
          color: statusColor,
        }}
      >
        {status}
      </span>
    </div>
  );
}

export function LedgerPanel() {
  return (
    <div className="relative z-10 mx-auto w-full max-w-[760px] px-4 sm:px-6">
      <div
        className="overflow-hidden rounded-t-[14px] border border-[#223044] bg-[#0E1722]/90 backdrop-blur"
        style={{
          boxShadow:
            "0 0 36px rgba(52,224,143,0.18), 0 20px 60px rgba(0,0,0,0.45)",
        }}
      >
        <div className="flex items-center justify-between border-b border-[#223044] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <h2
              className="text-[0.9375rem] font-semibold text-[#E8EEF5]"
              style={{ fontFamily: "var(--font-schibsted)" }}
            >
              Research agent
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#34E08F]/30 bg-[#34E08F]/15 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-[#34E08F]">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full bg-[#34E08F]"
              />
              Active
            </span>
          </div>

          <span
            className="text-[11px] font-medium tracking-wide text-[#7F93A8]"
            style={{ fontFamily: "var(--font-jetbrains-landing)" }}
          >
            Sample data
          </span>
        </div>

        <LedgerRow
          time="09:12"
          amount="0.03 SOL"
          recipient="api.search-tool.xyz"
          status="Approved"
        />

        <LedgerRow
          time="10:05"
          amount="0.09 SOL"
          recipient="7xK2...f9Qa, over the 0.05 limit"
          status="Blocked"
        />
      </div>
    </div>
  );
}
