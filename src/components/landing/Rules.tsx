"use client";

import { parseEther } from "viem";
import { DURATIONS, LOCK_SECONDS, MIN_STAKE_WEI, SETTLE_WINDOW_SECONDS, VOID_AFTER_SECONDS, durationLabel } from "@/config/game";
import { fmtEth, fmtSpan } from "@/lib/format";
import { useFeeBps } from "@/lib/hooks";
import { feeOf } from "@/lib/rounds";

const pct = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

/** The rules, printed from src/config/game.ts (and from the contract's own fee once one is deployed). */
export function Rules() {
  const { feeBps, fromContract } = useFeeBps();

  // The arithmetic of one decisive round, run through the same function the ticket uses.
  const up = parseEther("0.4");
  const down = parseEther("0.6");
  const stake = parseEther("0.1");
  const fee = feeOf(up, down, true, feeBps);
  const pool = up + down - fee;
  const payout = (pool * stake) / up;

  const rows: [string, string][] = [
    ["Round lengths", DURATIONS.map((d) => durationLabel(d)).join(" · ")],
    ["Stake", `Native ETH, ${fmtEth(MIN_STAKE_WEI)} or more, on UP or DOWN. You can add to either side until the lock.`],
    ["Lock", `Entries stop ${fmtSpan(LOCK_SECONDS)} before the round ends.`],
    ["Strike and close", `The first Pyth print at or after the start, and the first at or after the end. Each must be published within ${fmtSpan(SETTLE_WINDOW_SECONDS)} of its boundary.`],
    ["A decisive round", "Close above strike: the UP pot shares both pots. Close below strike: the DOWN pot does. Each winner is paid in proportion to their stake."],
    [
      "Fee",
      `${pct(feeBps)} of both pots, on a decisive round only, and never more than the losing pot — so a winner cannot get back less than the stake.${
        fromContract ? " Read from the contract." : " Set when the contract is deployed, fixed afterwards."
      }`,
    ],
    ["Flat price or empty side", "Close equal to strike, or nobody on one side: every stake is refunded in full, no fee."],
    ["Nobody settles", `A round still unsettled ${fmtSpan(VOID_AFTER_SECONDS)} after its end is void: every stake is refunded in full, no fee.`],
    ["Claims", "Winnings and refunds wait in the contract until claimed. There is no deadline."],
    ["Control", "No owner, no pause, no upgrade. The treasury address can receive the fee and nothing else."],
  ];

  return (
    <section id="rules" className="rule scroll-mt-20">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
        <h2 className="display text-[40px] sm:text-[56px]">The rules</h2>
        <p className="mt-5 max-w-2xl text-[19px] text-soft">Every number below is enforced by the contract. None of it can be changed after deployment.</p>

        <dl className="mt-12 border-b border-line">
          {rows.map(([k, v]) => (
            <div key={k} className="grid gap-1 border-t border-line py-5 md:grid-cols-[260px_1fr] md:gap-8">
              <dt className="text-[18px] font-bold">{k}</dt>
              <dd className="text-soft">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="card mt-14 p-6 sm:p-8">
          <h3 className="text-[24px] font-bold tracking-tight">The arithmetic of one round</h3>
          <p className="mt-2 text-soft">Round figures to show the calculation — not a real round.</p>
          <dl className="num mt-6 grid grid-cols-[1fr_auto] gap-x-6 gap-y-2.5 text-[16px] sm:text-[17px]">
            <dt className="text-soft">UP pot</dt>
            <dd className="text-right">{fmtEth(up)}</dd>
            <dt className="text-soft">DOWN pot</dt>
            <dd className="text-right">{fmtEth(down)}</dd>
            <dt className="text-soft">close above strike: fee {pct(feeBps)} of both pots</dt>
            <dd className="text-right">{fmtEth(fee)}</dd>
            <dt className="text-soft">shared by the UP pot</dt>
            <dd className="text-right">{fmtEth(pool)}</dd>
            <dt className="border-t border-line pt-3 text-ink">a {fmtEth(stake)} stake on UP is paid</dt>
            <dd className="border-t border-line pt-3 text-right font-bold text-accent-deep">{fmtEth(payout)}</dd>
          </dl>
        </div>
      </div>
    </section>
  );
}
