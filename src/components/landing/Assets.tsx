"use client";

import Link from "next/link";
import type { PricesResponse } from "@/app/api/prices/route";
import { roundsHref } from "@/components/Nav";
import { ASSETS, type GameAsset } from "@/config/game";
import { fmtClock, fmtDate, fmtUsd } from "@/lib/format";
import { usePrices } from "@/lib/hooks";

/** A print older than this is shown with its date instead of as "now". */
export const FRESH_SECONDS = 120;

export function priceNote(data: PricesResponse | undefined, symbol: string): { text: string; note: string } {
  const q = data?.prices[symbol];
  if (!data) return { text: "", note: "" };
  if (!q) return { text: "Price unavailable", note: data.source === "chain" ? "Pyth has no print for this feed on chain" : "No print returned" };
  const old = data.now - q.publishTime > FRESH_SECONDS;
  return { text: fmtUsd(q.price), note: old ? `Last print on chain: ${fmtDate(q.publishTime)}, ${fmtClock(q.publishTime).slice(0, 5)} UTC` : "Pyth, just now" };
}

export function Assets() {
  const prices = usePrices();
  return (
    <section id="assets" className="rule scroll-mt-20">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
        <h2 className="display text-[40px] sm:text-[56px]">The assets</h2>
        <p className="mt-5 max-w-2xl text-[19px] text-soft">
          {prices.isError
            ? "The reference prices could not be read just now."
            : prices.data?.source === "hermes"
              ? "Reference prices are the latest Pyth prints."
              : prices.data?.source === "chain"
                ? "Reference prices are the last Pyth prints stored on chain. They are only as recent as the last time someone pushed one, so some are old and some feeds have none."
                : "Reading the reference prices…"}{" "}
          Stocks use Pyth&apos;s round-the-clock price feeds, so their rounds run at night and on weekends too.
        </p>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ASSETS.map((a) => (
            <AssetCard key={a.symbol} asset={a} data={prices.data} failed={prices.isError} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function AssetCard({ asset, data, failed }: { asset: GameAsset; data?: PricesResponse; failed: boolean }) {
  const p = priceNote(data, asset.symbol);
  return (
    <li>
      <Link href={roundsHref(asset.symbol)} className="card group flex h-full flex-col gap-6 p-6 transition-colors hover:border-line-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[30px] font-extrabold leading-none tracking-tight">{asset.symbol}</span>
          <span className="text-[16px] text-soft">{asset.name}</span>
        </div>
        <div>
          <div className={`num text-[24px] ${data && !data.prices[asset.symbol] ? "text-mute" : "text-ink"}`}>
            {failed ? "Price unavailable" : p.text || "…"}
          </div>
          <div className="mt-1 text-[15px] text-mute">{failed ? "The price route did not answer" : p.note || "Reading…"}</div>
        </div>
        <div className="mt-auto flex items-center justify-between text-[16px]">
          <span className="num text-[14px] text-mute">{asset.pythSymbol}</span>
          <span className="font-semibold text-ink group-hover:text-accent-deep">Rounds →</span>
        </div>
      </Link>
    </li>
  );
}
