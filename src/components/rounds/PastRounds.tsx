"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { VOID_AFTER_SECONDS, durationLabel } from "@/config/game";
import { TILT_ADDRESS, chain, isLive } from "@/config/network";
import { tiltAbi } from "@/lib/abi/tilt";
import { fmtClock, fmtEth, fmtSpan, fmtUnits } from "@/lib/format";
import type { PastRound, usePastRounds } from "@/lib/hooks";
import { phaseOf, type Phase } from "@/lib/rounds";
import { SETTLE_LABEL, settleRound, type SettleStep } from "@/lib/settle";
import { explain } from "@/lib/tx";

const RESULT: Record<Phase, string> = {
  open: "Running",
  locked: "Locked",
  awaiting: "Awaiting settlement",
  up: "UP won",
  down: "DOWN won",
  refund: "Refunded",
  void: "Void · refunded",
};

/** The rounds of this asset and length that exist among the last twelve slots, and the Settle button for the ones still waiting. */
export function PastRounds({
  symbol,
  asset,
  duration,
  now,
  past,
  settlement,
  pricesKnown,
  onChanged,
}: {
  symbol: string;
  asset: number;
  duration: number;
  now: number;
  past: ReturnType<typeof usePastRounds>;
  /** Whether this site can fetch Pyth updates (a Hermes key is configured). */
  settlement: boolean;
  pricesKnown: boolean;
  onChanged: () => void;
}) {
  const { isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState<{ id: bigint; step: SettleStep } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settle = async (p: PastRound) => {
    const address = TILT_ADDRESS;
    if (!address || !publicClient) return;
    setError(null);
    try {
      await settleRound({
        publicClient,
        asset,
        symbol,
        start: p.start,
        duration,
        onStep: (step) => setBusy({ id: p.id, step }),
        send: (startData, endData, fee) =>
          writeContractAsync({ address, abi: tiltAbi, functionName: "settle", args: [p.id, startData, endData], value: fee, chainId: chain.id }),
      });
      onChanged();
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(null);
    }
  };

  const anyAwaiting = past.rounds.some((p) => phaseOf(p.round, now) === "awaiting");

  return (
    <section className="card p-6 sm:p-8" aria-label="Earlier rounds">
      <h2 className="text-[22px] font-bold tracking-tight">Earlier {durationLabel(duration)} rounds</h2>
      {!isLive ? (
        <p className="mt-3 text-soft">Nothing to show: the contract is not deployed, so no round has ever been played.</p>
      ) : past.isError ? (
        <p className="mt-3 text-soft">Earlier rounds could not be read from the chain.</p>
      ) : past.isLoading || now === 0 ? (
        <p className="mt-3 text-soft">Reading…</p>
      ) : past.rounds.length === 0 ? (
        <p className="mt-3 text-soft">None of the last twelve {symbol} slots was entered. A round only exists once someone stakes in it.</p>
      ) : (
        <>
          {isLive && pricesKnown && !settlement && anyAwaiting ? (
            <p className="mt-4 rounded-xl border border-line-2 bg-sand px-4 py-3 text-[16px]" role="status">
              <strong className="font-bold">Settlement is unavailable on this site:</strong> it has no Pyth key, so it cannot fetch the two prints a
              settlement needs. Anyone can still settle by calling the contract with their own Pyth update; a round left unsettled refunds after{" "}
              {fmtSpan(VOID_AFTER_SECONDS)}.
            </p>
          ) : null}
          <ul className="mt-4 divide-y divide-line">
            {past.rounds.map((p) => {
              const phase = phaseOf(p.round, now);
              const mine = busy?.id === p.id ? busy.step : null;
              return (
                <li key={p.id.toString()} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4">
                  <div className="min-w-0">
                    <div className="num text-[16px]">
                      {fmtClock(p.start)} → {fmtClock(p.start + duration)}
                    </div>
                    <div className="num text-[15px] text-mute">
                      UP {fmtEth(p.round.upPot)} · DOWN {fmtEth(p.round.downPot)}
                      {p.round.strike > 0n ? ` · ${fmtUnits(p.round.strike)} → ${fmtUnits(p.round.close)}` : ""}
                    </div>
                  </div>
                  {phase === "awaiting" ? (
                    <button
                      type="button"
                      className="btn btn-ink btn-sm"
                      disabled={!settlement || !isConnected || chainId !== chain.id || busy !== null}
                      onClick={() => settle(p)}
                    >
                      {mine ? SETTLE_LABEL[mine] : "Settle"}
                    </button>
                  ) : (
                    <span className={`text-[16px] font-bold ${phase === "up" ? "text-accent-deep" : phase === "down" ? "text-ink" : "text-soft"}`}>{RESULT[phase]}</span>
                  )}
                </li>
              );
            })}
          </ul>
          {anyAwaiting && settlement && (!isConnected || chainId !== chain.id) ? (
            <p className="mt-2 text-[15px] text-soft">Connect a wallet on {chain.name} to send a settlement. Anyone can; the prints decide the result, not the sender.</p>
          ) : null}
          {error ? (
            <p className="mt-3 text-[16px] font-medium text-accent-deep" role="alert">
              {error}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
