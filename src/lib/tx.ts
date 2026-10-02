import { BaseError, ContractFunctionRevertedError } from "viem";
import type { UpdateResponse } from "@/app/api/pyth/update/route";
import { LOCK_SECONDS, MIN_STAKE_WEI } from "@/config/game";
import { fmtEth } from "./format";

/** Pyth update data for the first print at or after `at`, from the site's Hermes route. */
export async function fetchUpdate(symbol: string, at: number): Promise<UpdateResponse> {
  const qs = new URLSearchParams({ asset: symbol, at: String(at) });
  const res = await fetch(`/api/pyth/update?${qs}`, { cache: "no-store" });
  const body = (await res.json()) as UpdateResponse & { error?: string };
  if (!res.ok || body.error) throw new Error(body.error ?? `update ${res.status}`);
  return body;
}

const REASONS: Record<string, string> = {
  Locked: `Entries are closed: a round locks ${LOCK_SECONDS} seconds before it ends.`,
  NotStarted: "That round has not started yet.",
  OffSchedule: "That start time is not on the round grid.",
  StakeTooSmall: `The minimum stake is ${fmtEth(MIN_STAKE_WEI)}.`,
  TooEarly: "Too early: the round has not ended yet.",
  Voided: "This round was not settled in time. It is void: stakes are refunded from Your positions.",
  AlreadySettled: "This round is already settled.",
  NoSuchRound: "Nobody entered that round, so it does not exist.",
  NothingToClaim: "Nothing to claim there.",
  FeeNotCovered: "The transaction did not cover the Pyth fee.",
  BadPrice: "Pyth returned a price the contract cannot use.",
  PriceFeedNotFoundWithinRange: "Pyth rejected the update: it was not the first print at or after the round boundary.",
  InsufficientFee: "The Pyth fee was not covered.",
};

/** A sentence instead of a stack of hex. */
export function explain(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((err) => err instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? revert.reason;
      if (name && REASONS[name]) return REASONS[name];
      if (name) return `The contract refused: ${name}.`;
    }
    if (/user rejected|denied/i.test(e.shortMessage)) return "You dismissed the wallet prompt.";
    if (/insufficient funds/i.test(e.shortMessage)) return "Not enough ETH for the stake and gas.";
    return e.shortMessage;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}
