"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";

const ConnectButton = dynamic(
  () => import("@/components/ConnectButton").then((m) => m.ConnectButton),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        className="h-10 w-[9.5rem] rounded-[8px] border border-[#2D4258] bg-[#0E1722]"
      />
    ),
  }
);

export function LandingNav() {
  return (
    <header className="relative z-10 w-full">
      <nav
        aria-label="Primary"
        className="mx-auto flex w-full max-w-[1160px] items-center justify-between gap-4 px-4 py-5 sm:px-6"
      >
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 rounded-[8px] px-1 py-1"
          aria-label="SpendGuard home"
        >
          <Image
            src="/spendguard-mark.svg"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 shrink-0"
            priority
          />
          <span
            className="text-[1.0625rem] font-semibold tracking-[-0.01em] text-[#E8EEF5]"
            style={{ fontFamily: "var(--font-schibsted)" }}
          >
            SpendGuard
          </span>
        </Link>

        <ul className="hidden items-center gap-7 md:flex" role="list">
          <li>
            <a
              href="#how-it-works"
              className="rounded-[6px] px-1 py-1 text-[0.875rem] font-medium text-[#9DB0C4] hover:text-[#E8EEF5]"
            >
              How it works
            </a>
          </li>
          <li>
            <a
              href="/dashboard"
              className="rounded-[6px] px-1 py-1 text-[0.875rem] font-medium text-[#9DB0C4] hover:text-[#E8EEF5]"
            >
              Policies
            </a>
          </li>
          <li>
            <a
              href="#docs"
              className="rounded-[6px] px-1 py-1 text-[0.875rem] font-medium text-[#9DB0C4] hover:text-[#E8EEF5]"
            >
              Docs
            </a>
          </li>
        </ul>

        <div className="flex shrink-0 items-center">
          <div className="[&>button]:!rounded-[8px] [&>button]:!border-0 [&>button]:!bg-[#34E08F] [&>button]:!px-5 [&>button]:!py-2.5 [&>button]:!text-[0.875rem] [&>button]:!font-semibold [&>button]:!text-[#06121C] [&>button]:hover:!bg-[#2fd68a] [&>div>div>button:first-child]:!rounded-[8px]">
            <ConnectButton />
          </div>
        </div>
      </nav>
    </header>
  );
}
