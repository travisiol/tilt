import Link from "next/link";
import { roundsHref } from "@/components/Nav";
import { Rocker } from "@/components/Rocker";
import { ASSETS, DURATIONS, LOCK_SECONDS, durationLabel } from "@/config/game";
import { chain, isLive } from "@/config/network";
import { site } from "@/config/site";

export function Hero() {
  // "Up or down. Five minutes." → two lines
  const [first, ...rest] = site.hook.split(". ");
  const second = rest.join(". ");
  const stocks = ASSETS.filter((a) => a.kind === "stock").length;
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-12 sm:px-8 md:grid-cols-[1.6fr_1fr] md:gap-10 md:pb-28 md:pt-20">
      <div>
        <h1 className="display text-[56px] sm:text-[76px] lg:text-[96px]">
          {first}.
          <br />
          <span className="text-accent lg:whitespace-nowrap">{second}</span>
        </h1>
        <p className="mt-8 max-w-xl text-[20px] leading-relaxed text-soft">
          Stake ETH on UP or DOWN before a round locks. Two Pyth prints decide it, and the winning pot shares both pots. Rounds of{" "}
          {DURATIONS.map((d) => durationLabel(d)).join(", ")} on BTC, ETH and {stocks} US stock prices, entries until {LOCK_SECONDS} seconds
          before the end.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link href={roundsHref()} className="btn btn-ink">
            Open the rounds
          </Link>
          <Link href="#rules" className="btn btn-line">
            Read the rules
          </Link>
        </div>
        <p className="mt-6 max-w-xl text-[16px] text-soft">
          {isLive ? (
            <>Running on {chain.name}. No owner: the rules are fixed in the contract.</>
          ) : (
            <>
              <strong className="font-semibold text-ink">Pre-launch.</strong> The contract is written and tested but not deployed, so nothing can
              be staked yet.
            </>
          )}
        </p>
      </div>
      <div className="flex justify-center md:justify-end md:pr-6">
        <Rocker />
      </div>
    </section>
  );
}
