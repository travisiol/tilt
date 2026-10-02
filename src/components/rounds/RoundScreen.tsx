"use client";

import Link from "next/link";
import { useState } from "react";
import { priceNote } from "@/components/landing/Assets";
import { roundsHref } from "@/components/Nav";
import { ASSETS, DURATIONS, LOCK_SECONDS, durationLabel, roundStart } from "@/config/game";
import { isLive } from "@/config/network";
import { useChainClock, useNow } from "@/lib/clock";
import { fmtClock, fmtCountdown, fmtEth, fmtMultiple, fmtUnits, fmtUsd } from "@/lib/format";
import { useFeeBps, useMyRounds, usePastRounds, usePrices, useRound, useStrikePrint } from "@/lib/hooks";
import { sideMultiple } from "@/lib/rounds";
import { MyPositions } from "./MyPositions";
import { PastRounds } from "./PastRounds";
import { Ticket } from "./Ticket";

/** One asset: the round in progress for the chosen length, the ticket, past rounds and the wallet's positions. */
export function RoundScreen({ asset }: { asset: number }) {
  const a = ASSETS[asset];
  const [duration, setDuration] = useState<number>(DURATIONS[0]);
  useChainClock(isLive);
  const now = useNow();
  const start = now > 0 ? roundStart(now, duration) : 0;
  const end = start + duration;
  const lockAt = end - LOCK_SECONDS;
  const locked = now >= lockAt;

  const current = useRound(asset, duration, start);
  const past = usePastRounds(asset, duration, start);
  const mine = useMyRounds();
  const prices = usePrices();
  const { feeBps } = useFeeBps();
  const settlement = prices.data?.settlement ?? false;
  const print = useStrikePrint(a.symbol, start, isLive && settlement && current.strike === 0n && now >= start + 3);

  const refreshAll = () => {
    current.refetch();
    past.refetch();
    mine.refetch();
  };

  const price = priceNote(prices.data, a.symbol);
  const upPot = current.round?.upPot ?? 0n;
  const downPot = current.round?.downPot ?? 0n;
  const total = upPot + downPot;
  const upShare = total > 0n ? Number((upPot * 1000n) / total) / 10 : 0;

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8 md:pt-14">
      <h1 className="display text-[44px] sm:text-[64px]">
        {a.symbol} <span className="text-mute">up or down</span>
      </h1>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <nav className="seg" aria-label="Asset">
          {ASSETS.map((x, i) => (
            <Link key={x.symbol} href={roundsHref(x.symbol)} className="seg-item" aria-current={i === asset ? "true" : undefined}>
              {x.symbol}
            </Link>
          ))}
        </nav>
        <div className="seg" role="group" aria-label="Round length">
          {DURATIONS.map((d) => (
            <button key={d} type="button" className="seg-item" aria-pressed={d === duration} onClick={() => setDuration(d)}>
              {durationLabel(d)}
            </button>
          ))}
        </div>
      </div>

      {!isLive ? (
        <p className="mt-8 rounded-2xl border-[1.5px] border-accent bg-accent-wash px-5 py-4 text-[17px]" role="status">
          <strong className="font-bold">Pre-launch: the contract is not deployed.</strong> There are no rounds, pots or positions to read, and nothing
          can be staked, claimed or settled yet. The clock below only shows the schedule rounds will follow.
        </p>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <section className="card p-6 sm:p-8" aria-label="Round in progress">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-[22px] font-bold tracking-tight">{isLive ? `This ${durationLabel(duration)} round` : `${durationLabel(duration)} schedule`}</h2>
            <span className="num text-[15px] text-soft">{start > 0 ? `${fmtClock(start)} → ${fmtClock(end)} UTC` : "…"}</span>
          </div>

          <div className="mt-8">
            <div className="text-[16px] text-soft">
              {start === 0 ? "Reading the clock…" : !isLive ? "This slot ends in" : locked ? "Locked · ends in" : "Entries lock in"}
            </div>
            <div className={`num mt-1 text-[64px] font-medium leading-none sm:text-[88px] ${isLive && locked ? "text-mute" : "text-ink"}`}>
              {start === 0 ? "--:--" : fmtCountdown((!isLive || locked ? end : lockAt) - now)}
            </div>
          </div>

          <dl className="mt-8 grid gap-6 border-t border-line pt-6 sm:grid-cols-2">
            <div>
              <dt className="text-[16px] text-soft">Strike</dt>
              {current.strike > 0n ? (
                <dd>
                  <div className="num text-[24px]">{fmtUnits(current.strike)}</div>
                  <div className="text-[15px] text-mute">Print at {fmtClock(start)}, stored on chain</div>
                </dd>
              ) : print.data ? (
                <dd>
                  <div className="num text-[24px]">{fmtUsd(print.data.price)}</div>
                  <div className="text-[15px] text-mute">
                    {print.data.source === "mock" ? "Local mock print" : "Pyth print"} at {fmtClock(print.data.publishTime)}, not on chain yet
                  </div>
                </dd>
              ) : (
                <dd>
                  <div className="text-[17px] leading-snug">{start > 0 ? `The first Pyth print at or after ${fmtClock(start)} UTC` : "…"}</div>
                  <div className="text-[15px] text-mute">
                    {!isLive ? "Read at settlement" : settlement ? "Not read yet" : "This site has no Pyth key to read it; it is read at settlement"}
                  </div>
                </dd>
              )}
            </div>
            <div>
              <dt className="text-[16px] text-soft">Reference price</dt>
              <dd>
                <div className={`num text-[24px] ${prices.data && !prices.data.prices[a.symbol] ? "text-mute" : ""}`}>
                  {prices.isError ? "Price unavailable" : price.text || "…"}
                </div>
                <div className="text-[15px] text-mute">{prices.isError ? "The price route did not answer" : price.note || "Reading…"}</div>
              </dd>
            </div>
          </dl>

          <div className="mt-6 border-t border-line pt-6">
            {!isLive ? (
              <p className="text-soft">No pots: the contract is not deployed.</p>
            ) : current.isError ? (
              <p className="text-soft">The round could not be read from the chain. Check the network and reload.</p>
            ) : current.isLoading || start === 0 ? (
              <p className="text-soft">Reading the round…</p>
            ) : current.id === 0n ? (
              <p className="text-soft">Nobody has entered this round yet. The first stake opens it.</p>
            ) : (
              <>
                <div className="pots" role="img" aria-label={`UP pot ${fmtEth(upPot)}, DOWN pot ${fmtEth(downPot)}`}>
                  <div className="pots-up" style={{ width: `${upShare}%` }} />
                  <div className="pots-down" style={{ width: `${100 - upShare}%` }} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[16px] font-bold text-accent-deep">UP pot</div>
                    <div className="num text-[22px]">{fmtEth(upPot)}</div>
                    <div className="num text-[15px] text-mute">{potNote(sideMultiple(upPot, downPot, true, feeBps), upPot)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[16px] font-bold">DOWN pot</div>
                    <div className="num text-[22px]">{fmtEth(downPot)}</div>
                    <div className="num text-[15px] text-mute">{potNote(sideMultiple(upPot, downPot, false, feeBps), downPot)}</div>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        <Ticket
          asset={asset}
          symbol={a.symbol}
          duration={duration}
          start={start}
          now={now}
          upPot={upPot}
          downPot={downPot}
          position={current.position}
          feeBps={feeBps}
          onDone={refreshAll}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <PastRounds symbol={a.symbol} asset={asset} duration={duration} now={now} past={past} settlement={settlement} pricesKnown={Boolean(prices.data)} onChanged={refreshAll} />
        <MyPositions now={now} mine={mine} settlement={settlement} onChanged={refreshAll} />
      </div>
    </div>
  );
}

function potNote(multiple: number | undefined, pot: bigint): string {
  if (pot === 0n) return "empty";
  if (multiple === undefined) return "other side empty: refund";
  return `pays ${fmtMultiple(multiple)} if it wins now`;
}
