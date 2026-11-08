import type { ReactNode } from "react";

export function Section({
  id,
  variant = "ink",
  children,
}: {
  id?: string;
  variant?: "ink" | "panel";
  children: ReactNode;
}) {
  const bg = variant === "panel" ? "bg-panel" : "bg-ink";
  return (
    <section id={id} className={`scroll-mt-[64px] ${bg} py-12 sm:py-[72px]`}>
      <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6">{children}</div>
    </section>
  );
}
