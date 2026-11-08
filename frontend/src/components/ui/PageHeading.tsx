import type { ReactNode } from "react";

export interface PageHeadingProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PageHeading({ title, description, action }: PageHeadingProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-[1.625rem] font-semibold leading-none text-paper sm:text-[2rem]">
          {title}
        </h1>
        {description ? <p className="mt-2 max-w-[60ch] text-[0.9375rem] text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
