"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { ASSETS, durationLabel } from "@/config/game";
import { TILT_ADDRESS, chain } from "@/config/network";
import { tiltAbi } from "@/lib/abi/tilt";
import { fmtDateTime, fmtEth } from "@/lib/format";
import type { MyRound, useMyRounds } from "@/lib/hooks";
import { phaseOf } from "@/lib/rounds";
import { SETTLE_LABEL, settleRound, type SettleStep } from "@/lib/settle";
import { explain } from "@/lib/tx";

function stateOf(m: MyRound, now: number): string {
  const phase = phaseOf(m.round, now);
  if (m.position.claimed) return phase === "refund" || phase === "void" ? "Refund claimed" : "Paid";
  if (phase === "open") return "Running";
  if (phase === "locked") return "Locked";
  if (phase === "awaiting") return "Awaiting settlement";
  if (phase === "refund") return "Refund to claim";
  if (phase === "void") return "Void · refund to claim";
  const won = phase === "up" ? m.position.up > 0n : m.position.down > 0n;
  return won ? "Won · to claim" : "Lost";
}

/** The connected wallet's rounds across every asset, with one button to claim everything owed. */
export function MyPositions({
  now,
  mine,
  settlement,
  onChanged,
}: {
  now: number;
  mine: ReturnType<typeof useMyRounds>;
  /** Whether this site can fetch Pyth updates (a Hermes key is configured). */
  settlement: boolean;
  onChanged: () => void;
}) {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settling, setSettling] = useState<{ id: bigint; step: SettleStep } | null>(null);

  const claimable = mine.rounds.filter((m) => m.owed > 0n);
  const total = claimable.reduce((sum, m) => sum + m.owed, 0n);

  const claimAll = async () => {
    if (!TILT_ADDRESS || !publicClient || !address || claimable.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const hash = await writeContractAsync({
        address: TILT_ADDRESS,
        abi: tiltAbi,
        functionName: "claimMany",
        args: [claimable.map((m) => m.id), address],
        chainId: chain.id,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The transaction reverted.");
      onChanged();
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  };

  const settle = async (m: MyRound) => {
    const contract = TILT_ADDRESS;
    const a = ASSETS[m.round.asset];
    if (!contract || !publicClient || !a) return;
    setError(null);
    try {
      await settleRound({
        publicClient,
        asset: m.round.asset,
        symbol: a.symbol,
        start: Number(m.round.start),
        duration: m.round.duration,
        onStep: (step) => setSettling({ id: m.id, step }),
        send: (startData, endData, fee) =>
          writeContractAsync({ address: contract, abi: tiltAbi, functionName: "settle", args: [m.id, startData, endData], value: fee, chainId: chain.id }),
      });
      onChanged();
    } catch (e) {
      setError(explain(e));
    } finally {
      setSettling(null);
    }
  };

  return (
    <section className="card p-6 sm:p-8" aria-label="Your positions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[22px] font-bold tracking-tight">Your positions</h2>
        {claimable.length > 0 ? (
          <button type="button" className="btn btn-accent btn-sm" disabled={busy || chainId !== chain.id} onClick={claimAll}>
            {busy ? "Claiming…" : `Claim ${fmtEth(total)}`}
          </button>
        ) : null}
      </div>
      {!isConnected ? (
        <p className="mt-3 text-soft">Connect a wallet to see its rounds and claim what they owe.</p>
      ) : mine.isError ? (
        <p className="mt-3 text-soft">Your positions could not be read from the chain.</p>
      ) : mine.isLoading ? (
        <p className="mt-3 text-soft">Reading…</p>
      ) : mine.rounds.length === 0 ? (
        <p className="mt-3 text-soft">This wallet has not entered any round.</p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-line">
            {mine.rounds.map((m) => (
              <li key={m.id.toString()} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-4">
                <div className="min-w-0">
                  <div className="text-[16px] font-bold">
                    {ASSETS[m.round.asset]?.symbol ?? `asset ${m.round.asset}`} · {durationLabel(m.round.duration)}{" "}
                    <span className="num font-normal text-soft">{fmtDateTime(Number(m.round.start))} UTC</span>
                  </div>
                  <div className="num text-[15px] text-mute">
                    {m.position.up > 0n ? `${fmtEth(m.position.up)} on UP` : ""}
                    {m.position.up > 0n && m.position.down > 0n ? " · " : ""}
                    {m.position.down > 0n ? `${fmtEth(m.position.down)} on DOWN` : ""}
                  </div>
                </div>
                <div className="text-right">
                  {m.owed > 0n ? <div className="num text-[16px] font-bold text-accent-deep">+{fmtEth(m.owed)}</div> : null}
                  <div className="text-[15px] text-soft">{stateOf(m, now)}</div>
                  {settlement && phaseOf(m.round, now) === "awaiting" ? (
                    <button type="button" className="btn btn-ink btn-sm mt-2" disabled={settling !== null || chainId !== chain.id} onClick={() => settle(m)}>
                      {settling?.id === m.id ? SETTLE_LABEL[settling.step] : "Settle"}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {mine.total > mine.rounds.length ? (
            <p className="mt-3 text-[15px] text-mute">
              Showing the {mine.rounds.length} most recent of {mine.total} rounds. Older ones can still be claimed from the contract.
            </p>
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
