type PreviewRow = {
  label: string;
  value?: string;
  tone?: "white" | "green" | "orange" | "muted";
};

type PreviewPanelProps = {
  rows: PreviewRow[];
};

function valueColor(tone: PreviewRow["tone"]) {
  if (tone === "green") {
    return "#34E08F";
  }
  if (tone === "orange") {
    return "#FF7A45";
  }
  if (tone === "muted") {
    return "#7F93A8";
  }
  return "#E8EEF5";
}

export function PreviewPanel({ rows }: PreviewPanelProps) {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-[10px] border border-[#223044] bg-[#0A111B]"
    >
      {rows.map((row) => {
        const hasValue = row.value !== undefined && row.value !== "";
        return (
          <div
            key={`${row.label}-${row.value ?? "novalue"}`}
            className="flex h-9 items-center justify-between gap-3 border-b border-[#223044] px-3 last:border-b-0"
          >
            <span
              className="text-[12px] tabular-nums text-[#7F93A8]"
              style={{ fontFamily: "var(--font-jetbrains-landing)" }}
            >
              {row.label}
            </span>
            {hasValue ? (
              <span
                className="text-[12px] font-medium tabular-nums"
                style={{
                  fontFamily: "var(--font-jetbrains-landing)",
                  color: valueColor(row.tone),
                }}
              >
                {row.value}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
