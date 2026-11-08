import Image from "next/image";
import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="border-t border-line bg-ink py-8">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-paper">
          <span className="inline-flex h-7 w-7 overflow-hidden rounded-chip">
            <Image src="/images/spendguard-logo.png" alt="SpendGuard" width={28} height={28} className="h-7 w-7 object-cover" />
          </span>
          <span className="font-display text-[1rem] font-semibold">SpendGuard</span>
          <span className="ml-2 text-[0.8125rem] text-muted">Devnet only</span>
        </Link>
        <a href="https://explorer.solana.com/address/AzvuWQBBrawzLRFYkH7DiCY4c9326cnncJWGkySnEsEZ?cluster=devnet" target="_blank" rel="noreferrer" className="text-[0.8125rem] font-semibold text-leash hover:underline">
          View program on explorer
        </a>
      </div>
    </footer>
  );
}
