import type { ReactNode } from "react";
import { InfoIcon, SpinnerIcon, WarningIcon } from "@/components/ui/Icons";

type StateVariant = "loading" | "empty" | "unavailable" | "error";

export interface StateViewProps {
  variant: StateVariant;
  title: string;
  description?: string;
  action?: ReactNode;
}

const icons: Record<StateVariant, ReactNode> = {
  loading: <SpinnerIcon className="animate-spin motion-reduce:animate-none" aria-hidden />,
  empty: <InfoIcon aria-hidden />,
  unavailable: <WarningIcon aria-hidden />,
  error: <WarningIcon aria-hidden />,
};

export function StateView({ variant, title, description, action }: StateViewProps) {
  const muted = variant === "unavailable" || variant === "error";
  return (
    <div
      className={`flex flex-col items-start gap-3 rounded-panel border ${muted ? "border-line bg-panel" : "border-line bg-panel"} p-5 sm:p-6`}
      role={variant === "error" || variant === "unavailable" ? "alert" : undefined}
    >
      <div className="flex items-center gap-2 text-[0.9375rem] font-semibold text-paper">
        <span className={variant === "loading" ? "text-muted" : variant === "unavailable" ? "text-caution" : "text-muted"}>
          {icons[variant]}
        </span>
        {title}
      </div>
      {description ? <p className="max-w-[60ch] text-[0.9375rem] text-muted">{description}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
