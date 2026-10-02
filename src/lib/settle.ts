import type { PublicClient } from "viem";
import { PYTH_ADDRESS, TILT_ADDRESS } from "@/config/network";
import { pythAbi } from "./abi/pyth";
import { tiltAbi } from "./abi/tilt";
import { fetchUpdate } from "./tx";

export type SettleStep = "prints" | "wallet" | "mining";

/** Sends settle(id, startData, endData) with `fee` attached and returns the transaction hash. */
export type SendSettle = (startData: `0x${string}`[], endData: `0x${string}`[], fee: bigint) => Promise<`0x${string}`>;

/**
 * Settles one ended round from the browser: fetches the Pyth update for each
 * boundary the chain does not store yet (through the site's Hermes route),
 * pays Pyth's update fee, sends settle() and waits for the receipt.
 */
export async function settleRound(opts: {
  publicClient: PublicClient;
  send: SendSettle;
  asset: number;
  symbol: string;
  start: number;
  duration: number;
  onStep: (step: SettleStep) => void;
}): Promise<void> {
  const { publicClient, send, asset, symbol, start, duration, onStep } = opts;
  if (!TILT_ADDRESS) throw new Error("Settlement is not open yet.");
  onStep("prints");
  const end = start + duration;
  const [strike, close] = await Promise.all([
    publicClient.readContract({ address: TILT_ADDRESS, abi: tiltAbi, functionName: "priceAt", args: [asset, BigInt(start)] }),
    publicClient.readContract({ address: TILT_ADDRESS, abi: tiltAbi, functionName: "priceAt", args: [asset, BigInt(end)] }),
  ]);
  const startData = strike > 0n ? [] : (await fetchUpdate(symbol, start)).data;
  const endData = close > 0n ? [] : (await fetchUpdate(symbol, end)).data;
  let fee = 0n;
  for (const data of [startData, endData]) {
    if (data.length > 0) fee += await publicClient.readContract({ address: PYTH_ADDRESS, abi: pythAbi, functionName: "getUpdateFee", args: [data] });
  }
  onStep("wallet");
  const hash = await send(startData, endData, fee);
  onStep("mining");
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The transaction reverted.");
}

export const SETTLE_LABEL: Record<SettleStep, string> = {
  prints: "Fetching the prints…",
  wallet: "Confirm in your wallet…",
  mining: "Settling…",
};
