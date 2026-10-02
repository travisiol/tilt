"use client";

import { useState } from "react";
import { parseEther } from "viem";
import { useAccount, useBalance, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { LOCK_SECONDS, MIN_STAKE_WEI, durationLabel } from "@/config/game";
import { TILT_ADDRESS, chain, explorer, isLive } from "@/config/network";
import { tiltAbi } from "@/lib/abi/tilt";
import { fmtCountdown, fmtEth, fmtMultiple } from "@/lib/format";
import { quote, type PositionView } from "@/lib/rounds";
import { explain } from "@/lib/tx";

const QUICK = ["0.001", "0.01", "0.05", "0.1"];

export function Ticket({
  asset,
  symbol,
  duration,
  start,
  now,
  upPot,
  downPot,
  position,
  feeBps,
  onDone,
}: {
  asset: number;
  symbol: string;
  duration: number;
  start: number;
  now: number;
  upPot: bigint;
  downPot: bigint;
  position?: PositionView;
  feeBps: number;
  onDone: () => void;
}) {
  const { address, isConnected, chainId } = useAccount();
  const balance = useBalance({ address, query: { enabled: isLive && Boolean(address), refetchInterval: 10_000 } });
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const [up, setUp] = useState(true);
  const [stake, setStake] = useState("0.01");
  const [busy, setBusy] = useState<"idle" | "wallet" | "mining">("idle");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ hash: `0x${string}`; start: number } | null>(null);
  // the receipt link belongs to the round it was sent in
  const hash = sent && sent.start === start ? sent.hash : null;

  let stakeWei = 0n;
  try {
    stakeWei = stake.trim() ? parseEther(stake.trim()) : 0n;
  } catch {
    stakeWei = 0n;
  }
  const end = start + duration;
  const locked = start > 0 && now + LOCK_SECONDS >= end;
  const wrongChain = isConnected && chainId !== chain.id;
  const tooSmall = stakeWei < MIN_STAKE_WEI;
  const q = isLive ? quote(stakeWei, up, upPot, downPot, feeBps) : undefined;
  const sideName = up ? "UP" : "DOWN";
  const disabledAll = !isLive;

  const enter = async () => {
    if (!TILT_ADDRESS || !publicClient || start === 0) return;
    setError(null);
    setSent(null);
    try {
      setBusy("wallet");
      const tx = await writeContractAsync({
        address: TILT_ADDRESS,
        abi: tiltAbi,
        functionName: "enter",
        args: [asset, duration, BigInt(start), up],
        value: stakeWei,
        chainId: chain.id,
      });
      setSent({ hash: tx, start });
      setBusy("mining");
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
      if (receipt.status !== "success") throw new Error("The transaction reverted.");
      onDone();
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy("idle");
    }
  };

  const switchNetwork = async () => {
    setError(null);
    try {
      await switchChainAsync({ chainId: chain.id });
    } catch (e) {
      setError(explain(e));
    }
  };

  return (
    <section className="card p-6 sm:p-8" aria-label="Ticket">
      <h2 className="text-[22px] font-bold tracking-tight">Your ticket</h2>
      <p className="mt-1 text-[16px] text-soft">
        {symbol} · {durationLabel(duration)} round
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3" role="group" aria-label="Side">
        <button type="button" className="side side-up" aria-pressed={up} disabled={disabledAll} onClick={() => setUp(true)}>
          <span className="text-[26px] font-extrabold leading-none tracking-tight">UP</span>
          <span className="text-[15px] opacity-80">close above strike</span>
        </button>
        <button type="button" className="side side-down" aria-pressed={!up} disabled={disabledAll} onClick={() => setUp(false)}>
          <span className="text-[26px] font-extrabold leading-none tracking-tight">DOWN</span>
          <span className="text-[15px] opacity-80">close below strike</span>
        </button>
      </div>

      <label className="mt-6 block text-[16px] text-soft" htmlFor="stake">
        Stake
      </label>
      <div className="relative mt-2">
        <input
          id="stake"
          className="field pr-16"
          inputMode="decimal"
          autoComplete="off"
          value={stake}
          disabled={disabledAll}
          onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ""))}
        />
        <span className="num pointer-events-none absolute inset-y-0 right-4 flex items-center text-[16px] text-mute">ETH</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {QUICK.map((v) => (
          <button
            key={v}
            type="button"
            className={`tag num hover:border-ink hover:text-ink disabled:opacity-50 ${stake === v ? "border-ink text-ink" : ""}`}
            disabled={disabledAll}
            onClick={() => setStake(v)}
          >
            {v}
          </button>
        ))}
        {balance.data ? <span className="num ml-auto text-[15px] text-mute">balance {fmtEth(balance.data.value)}</span> : null}
      </div>

      {q ? (
        <p className="mt-6 border-t border-line pt-5 text-[17px]">
          {q.refundOnly ? (
            <>Nobody is on {up ? "DOWN" : "UP"} yet. If it stays that way, the round refunds your stake.</>
          ) : (
            <>
              If {sideName} wins with the pots as they stand:{" "}
              <span className="num font-bold">
                {fmtEth(q.payout)} ({fmtMultiple(q.multiple)})
              </span>
              . Later stakes change this.
            </>
          )}
        </p>
      ) : null}

      {position && (position.up > 0n || position.down > 0n) ? (
        <p className="num mt-4 text-[15px] text-soft">
          Already in this round: {fmtEth(position.up)} on UP · {fmtEth(position.down)} on DOWN
        </p>
      ) : null}

      <div className="mt-6">
        {!isLive ? (
          <>
            <button type="button" className="btn btn-ink w-full" disabled>
              Contract not deployed
            </button>
            <p className="mt-3 text-[15px] text-soft">Staking is disabled: there is no contract to send a stake to yet.</p>
          </>
        ) : !isConnected ? (
          <ConnectButton size="md" className="w-full" />
        ) : wrongChain ? (
          <button type="button" className="btn btn-accent w-full" onClick={switchNetwork}>
            Switch to {chain.name}
          </button>
        ) : locked ? (
          <button type="button" className="btn btn-line w-full" disabled>
            Locked · next round in {fmtCountdown(end - now)}
          </button>
        ) : (
          <button type="button" className={`btn w-full ${up ? "btn-accent" : "btn-ink"}`} disabled={busy !== "idle" || tooSmall || start === 0} onClick={enter}>
            {busy === "wallet"
              ? "Confirm in your wallet…"
              : busy === "mining"
                ? "Waiting for the block…"
                : tooSmall
                  ? `Minimum ${fmtEth(MIN_STAKE_WEI)}`
                  : `Stake ${fmtEth(stakeWei)} on ${sideName}`}
          </button>
        )}
        {error ? (
          <p className="mt-3 text-[16px] font-medium text-accent-deep" role="alert">
            {error}
          </p>
        ) : null}
        {hash ? (
          <p className="num mt-3 text-[15px] text-soft">
            tx{" "}
            <a href={explorer.tx(hash)} target="_blank" rel="noreferrer" className="underline decoration-line-2 underline-offset-4 hover:text-ink">
              {hash.slice(0, 12)}…
            </a>
          </p>
        ) : null}
      </div>
    </section>
  );
}
