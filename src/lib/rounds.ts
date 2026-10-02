import { LOCK_SECONDS, VOID_AFTER_SECONDS } from "@/config/game";

/** Tilt.Outcome */
export const PENDING = 0;
export const UP = 1;
export const DOWN = 2;
export const REFUND = 3;

/** Tilt.Round, as returned by getRound(). */
export type RoundView = {
  asset: number;
  outcome: number;
  duration: number;
  start: bigint;
  strike: bigint;
  close: bigint;
  upPot: bigint;
  downPot: bigint;
  payoutPool: bigint;
  fee: bigint;
};

/** Tilt.Position */
export type PositionView = { up: bigint; down: bigint; claimed: boolean };

export type Phase = "open" | "locked" | "awaiting" | "up" | "down" | "refund" | "void";

/**
 * Where a round stands at chain time `now`, mirroring Tilt.sol: a stored
 * outcome wins; otherwise the clock decides, and a one-sided round counts as
 * a refund from the moment it locks.
 */
export function phaseOf(r: Pick<RoundView, "outcome" | "start" | "duration" | "upPot" | "downPot">, now: number): Phase {
  if (r.outcome === UP) return "up";
  if (r.outcome === DOWN) return "down";
  if (r.outcome === REFUND) return "refund";
  const end = Number(r.start) + r.duration;
  if (now > end + VOID_AFTER_SECONDS) return "void";
  const oneSided = r.upPot === 0n || r.downPot === 0n;
  if (now + LOCK_SECONDS >= end && oneSided) return "refund";
  if (now >= end) return "awaiting";
  if (now + LOCK_SECONDS >= end) return "locked";
  return "open";
}

/** The fee of a decisive round: feeBps of both pots, capped at the losing pot (Tilt.settle). */
export function feeOf(upPot: bigint, downPot: bigint, upWins: boolean, feeBps: number): bigint {
  const total = upPot + downPot;
  const losing = upWins ? downPot : upPot;
  const fee = (total * BigInt(feeBps)) / 10_000n;
  return fee > losing ? losing : fee;
}

export type Quote = {
  /** What the stake would be paid if its side wins, on the pots as they stand plus this stake. */
  payout: bigint;
  /** payout / stake */
  multiple: number;
  /** True when the other side is empty: the round would refund instead of paying. */
  refundOnly: boolean;
};

/** The contract's payout arithmetic for a new stake of `stake` on one side. */
export function quote(stake: bigint, up: boolean, upPot: bigint, downPot: bigint, feeBps: number): Quote | undefined {
  if (stake <= 0n) return undefined;
  const newUp = up ? upPot + stake : upPot;
  const newDown = up ? downPot : downPot + stake;
  const mine = up ? newUp : newDown;
  const other = up ? newDown : newUp;
  if (other === 0n) return { payout: stake, multiple: 1, refundOnly: true };
  const pool = newUp + newDown - feeOf(newUp, newDown, up, feeBps);
  const payout = (pool * stake) / mine;
  return { payout, multiple: Number((payout * 10_000n) / stake) / 10_000, refundOnly: false };
}

/** What a settled side returns per unit staked: payoutPool / winning pot. */
export function sideMultiple(upPot: bigint, downPot: bigint, up: boolean, feeBps: number): number | undefined {
  const mine = up ? upPot : downPot;
  const other = up ? downPot : upPot;
  if (mine === 0n || other === 0n) return undefined;
  const pool = upPot + downPot - feeOf(upPot, downPot, up, feeBps);
  return Number((pool * 10_000n) / mine) / 10_000;
}
