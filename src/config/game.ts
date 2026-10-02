/**
 * The whole game in one file: which assets have rounds, how long a round
 * lasts, and the numbers the contract enforces. The site prints its rules
 * from here, contracts/scripts/deploy.ts builds the constructor arguments
 * from here, and contracts/test/Tilt.test.ts checks that the constants below
 * equal the ones compiled into Tilt.sol.
 *
 * No import and no environment read on purpose: Hardhat loads this file too.
 */

/** Round lengths in seconds. Constructor argument: fixed at deployment. */
export const DURATIONS = [300, 900, 3600] as const;
export type Duration = (typeof DURATIONS)[number];

/** Tilt.LOCK — entries stop this many seconds before a round ends. */
export const LOCK_SECONDS = 30;
/** Tilt.SETTLE_WINDOW — a boundary print must be published within this many seconds of the boundary. */
export const SETTLE_WINDOW_SECONDS = 900;
/** Tilt.VOID_AFTER — a round nobody settled this long after its end refunds every stake. */
export const VOID_AFTER_SECONDS = 86_400;
/** Tilt.MIN_STAKE, in wei (0.0001 ETH). */
export const MIN_STAKE_WEI = 100_000_000_000_000n;
/** Fee in basis points, taken on a decisive round only. Constructor argument (Tilt.MAX_FEE_BPS caps it at 500). */
export const FEE_BPS = 200;

export type AssetKind = "crypto" | "stock";

export type GameAsset = {
  symbol: string;
  name: string;
  kind: AssetKind;
  /** 0x-prefixed 32-byte Pyth price feed id. */
  feedId: `0x${string}`;
  /** Pyth's own name for the feed. */
  pythSymbol: string;
};

/**
 * In contract order: the index is the on-chain asset id.
 *
 * Feed ids are Pyth price feed ids (Hermes /v2/price_feeds, read 2026-09-15).
 * Stocks use Pyth's 24/7 "Index" feeds rather than the market-hours
 * Equity.US ones, so a round on a Saturday still has a print to settle on.
 */
export const ASSETS: readonly GameAsset[] = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    kind: "crypto",
    feedId: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
    pythSymbol: "Crypto.BTC/USD",
  },
  {
    symbol: "ETH",
    name: "Ether",
    kind: "crypto",
    feedId: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    pythSymbol: "Crypto.ETH/USD",
  },
  {
    symbol: "NVDA",
    name: "NVIDIA",
    kind: "stock",
    feedId: "0xa470c4ac46f44b547b2cba52338f311fb642b79375ce5f0cfd5cb5b99227b852",
    pythSymbol: "Equity.Index.NVDA/USD",
  },
  {
    symbol: "TSLA",
    name: "Tesla",
    kind: "stock",
    feedId: "0xe6da44bff5b8b06897a3739dd331b440d6662595bb862e37046892c568ae3fc0",
    pythSymbol: "Equity.Index.TSLA/USD",
  },
  {
    symbol: "HOOD",
    name: "Robinhood",
    kind: "stock",
    feedId: "0x4a4f96283d157d08b7b8aa596363f7978587d4fa59a77dcb90f84af7d870a630",
    pythSymbol: "Equity.Index.HOOD/USD",
  },
  {
    symbol: "MSTR",
    name: "Strategy",
    kind: "stock",
    feedId: "0x109b49ea13e04334cb570ba3b0fb1a18d500d8eeaf32ad1987816eb4bb26d8f3",
    pythSymbol: "Equity.Index.MSTR/USD",
  },
];

export function assetIndex(symbol: string): number {
  return ASSETS.findIndex((a) => a.symbol.toLowerCase() === symbol.toLowerCase());
}

/** Constructor tuples, in the contract's field order. */
export function assetTuples(): { feedId: `0x${string}`; symbol: string }[] {
  return ASSETS.map((a) => ({ feedId: a.feedId, symbol: a.symbol }));
}

/** "5 min" · "15 min" · "1 h" */
export function durationLabel(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

/** "five minutes" for the shortest round, used in headlines. */
export function durationWords(seconds: number): string {
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const say = (n: number, unit: string) => `${n <= 10 ? words[n] : String(n)} ${unit}${n === 1 ? "" : "s"}`;
  if (seconds % 3600 === 0) return say(seconds / 3600, "hour");
  if (seconds % 60 === 0) return say(seconds / 60, "minute");
  return say(seconds, "second");
}

/** Start of the round of `duration` that contains the second `at`. */
export function roundStart(at: number, duration: number): number {
  return Math.floor(at / duration) * duration;
}
