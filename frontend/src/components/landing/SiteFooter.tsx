import Image from "next/image";

export function SiteFooter() {
  return (
    <footer className="w-full border-t border-[#162231] bg-[#0A111B]">
      <div className="mx-auto flex w-full max-w-[1160px] flex-col items-center gap-4 px-4 py-6 sm:flex-row sm:justify-between sm:px-6 sm:py-0 sm:min-h-[84px]">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/spendguard-mark.svg"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 shrink-0"
              aria-hidden="true"
            />
            <span
              className="text-[18px] font-semibold text-white"
              style={{ fontFamily: "var(--font-inter-landing)" }}
            >
              SpendGuard
            </span>
          </div>
          <span
            className="text-[14px] text-[#9DB0C4] sm:ml-0"
            style={{ fontFamily: "var(--font-inter-landing)" }}
          >
            Devnet only
          </span>
        </div>

        <a
          href="#"
          className="text-[15px] font-semibold text-[#34E08F] hover:underline hover:decoration-[#34E08F] underline-offset-4"
          style={{ fontFamily: "var(--font-inter-landing)" }}
        >
          View program on explorer
        </a>
      </div>
    </footer>
  );
}
