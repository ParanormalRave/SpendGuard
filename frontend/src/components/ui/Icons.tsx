import type { ReactNode, SVGProps } from "react";

/**
 * SpendGuard icon set (docs/design.md section 7).
 *
 * These are the only glyphs the approved UI needs: five sidebar items, three
 * pieces of chrome, four status marks, eight action marks and one spinner.
 * The Alerts sidebar item and the header bell share `BellIcon`; there is no
 * second bell glyph.
 *
 * Conventions:
 * - Everything is stroked with `currentColor`, so a parent sets the colour.
 * - Icons are decorative by default (`aria-hidden`). Pass `title` only when the
 *   icon itself carries meaning; an icon-only button still needs `aria-label`.
 * - `SpinnerIcon` is static. Add `animate-spin motion-reduce:animate-none` at
 *   the call site so reduced-motion users get a still frame.
 */

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** Rendered width and height in pixels. Defaults to 20. */
  size?: number;
  /** Accessible name. Omit for decorative icons. */
  title?: string;
}

function Glyph({ size = 20, title, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

// ------------------------------------------------------------------ navigation

export function DashboardIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </Glyph>
  );
}

export function PoliciesIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M6.5 3.5h7l4 4v13h-11z" />
      <path d="M13.5 3.5v4h4" />
      <path d="M9 12h6M9 15.5h6" />
    </Glyph>
  );
}

export function ActivityIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />
    </Glyph>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M18 9a6 6 0 1 0-12 0c0 4.5-2 5.5-2 5.5h16S18 13.5 18 9" />
      <path d="M10 18.5a2 2 0 0 0 4 0" />
    </Glyph>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 7h4M12 7h8M4 12h10M18 12h2M4 17h2M10 17h10" />
      <circle cx="10" cy="7" r="2" />
      <circle cx="16" cy="12" r="2" />
      <circle cx="8" cy="17" r="2" />
    </Glyph>
  );
}

// ---------------------------------------------------------------------- chrome

export function MenuIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Glyph>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 7.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M4 7.5V6a2 2 0 0 1 2-2h10" />
      <circle cx="17" cy="13" r="1.25" />
    </Glyph>
  );
}

// ---------------------------------------------------------------------- status

export function CheckIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Glyph>
  );
}

export function BlockIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m6 6 12 12" />
    </Glyph>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 4 21 20H3z" />
      <path d="M12 9.5v5" />
      <path d="M12 17.5h.01" />
    </Glyph>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <path d="M12 7.75h.01" />
    </Glyph>
  );
}

// --------------------------------------------------------------------- actions

export function PauseIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="8.5" y="5.5" width="2.5" height="13" rx="1" />
      <rect x="13" y="5.5" width="2.5" height="13" rx="1" />
    </Glyph>
  );
}

export function ResumeIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M8 5.5 19 12 8 18.5z" />
    </Glyph>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 5v14M5 12h14" />
    </Glyph>
  );
}

export function DepositIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 4v10" />
      <path d="m8 10.5 4 4 4-4" />
      <path d="M4 19.5h16" />
    </Glyph>
  );
}

export function WithdrawIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 20V9.5" />
      <path d="m8 13.5 4-4 4 4" />
      <path d="M4 4.5h16" />
    </Glyph>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M14 4.5h5.5V10" />
      <path d="M19.5 4.5 11 13" />
      <path d="M18 14v5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5h5" />
    </Glyph>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 5.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v8.5A1.5 1.5 0 0 0 5 15h.5" />
    </Glyph>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Glyph>
  );
}

// --------------------------------------------------------------------- loading

export function SpinnerIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="8.5" opacity={0.25} />
      <path d="M20.5 12a8.5 8.5 0 0 0-8.5-8.5" />
    </Glyph>
  );
}
