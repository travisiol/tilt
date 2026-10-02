import Link from "next/link";
import { ASSETS } from "@/config/game";
import { site } from "@/config/site";
import { ConnectButton } from "./ConnectButton";

export const roundsHref = (symbol: string = ASSETS[0].symbol) => `/rounds/${symbol.toLowerCase()}`;

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bone">
      <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" aria-label={`${site.name} home`} className="display text-[26px]" translate="no">
          {site.name}
        </Link>
        <nav className="hidden items-center gap-8 text-[16px] font-medium text-soft md:flex">
          <Link href={roundsHref()} className="hover:text-ink">
            Rounds
          </Link>
          <Link href="/#how" className="hover:text-ink">
            How it works
          </Link>
          <Link href="/#rules" className="hover:text-ink">
            Rules
          </Link>
          <Link href="/#faq" className="hover:text-ink">
            FAQ
          </Link>
        </nav>
        <ConnectButton />
      </div>
    </header>
  );
}
