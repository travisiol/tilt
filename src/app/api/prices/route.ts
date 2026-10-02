import { NextResponse } from "next/server";
import { parseAbi } from "viem";
import { ASSETS } from "@/config/game";
import { PYTH_ADDRESS, PYTH_MOCK } from "@/config/network";
import { fetchLatest, hermesConfigured } from "@/lib/hermes";
import { serverClient } from "@/lib/server/chain";

export const dynamic = "force-dynamic";

export type PriceQuote = { price: number; publishTime: number };
export type PricesResponse = {
  /**
   * "hermes": the latest print from Pyth's price service (needs PYTH_API_KEY).
   * "chain": the last print stored in the Pyth contract on chain — it is only
   * as recent as the last time somebody pushed an update there.
   */
  source: "hermes" | "chain";
  /** null: no price could be read for that asset. */
  prices: Record<string, PriceQuote | null>;
  /** True when this site can fetch the Pyth updates a settlement needs. */
  settlement: boolean;
  now: number;
};

const pythAbi = parseAbi([
  "function getPriceUnsafe(bytes32 id) view returns ((int64 price, uint64 conf, int32 expo, uint256 publishTime))",
  "function priceFeedExists(bytes32 id) view returns (bool)",
]);

let cache: { at: number; body: PricesResponse } | undefined;
const TTL_MS = 2_500;
const settlement = hermesConfigured || PYTH_MOCK;

async function fromHermes(): Promise<PricesResponse> {
  const upd = await fetchLatest(ASSETS.map((a) => a.feedId));
  const prices: Record<string, PriceQuote | null> = {};
  for (const a of ASSETS) {
    const p = upd.parsed.find((x) => x.id.toLowerCase() === a.feedId.toLowerCase());
    prices[a.symbol] = p ? { price: p.price, publishTime: p.publishTime } : null;
  }
  return { source: "hermes", prices, settlement, now: Math.floor(Date.now() / 1000) };
}

async function fromChain(): Promise<PricesResponse> {
  const client = serverClient();
  const prices: Record<string, PriceQuote | null> = {};
  const results = await Promise.all(
    ASSETS.map(async (a) => {
      try {
        const exists = await client.readContract({ address: PYTH_ADDRESS, abi: pythAbi, functionName: "priceFeedExists", args: [a.feedId] });
        if (!exists) return null;
        const p = await client.readContract({ address: PYTH_ADDRESS, abi: pythAbi, functionName: "getPriceUnsafe", args: [a.feedId] });
        const price = Number(p.price) * 10 ** p.expo;
        return price > 0 ? { price, publishTime: Number(p.publishTime) } : null;
      } catch {
        return null;
      }
    }),
  );
  ASSETS.forEach((a, i) => (prices[a.symbol] = results[i]));
  return { source: "chain", prices, settlement, now: Math.floor(Date.now() / 1000) };
}

const nothing = (): PricesResponse => ({
  source: "chain",
  prices: Object.fromEntries(ASSETS.map((a) => [a.symbol, null])),
  settlement,
  now: Math.floor(Date.now() / 1000),
});

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) return NextResponse.json(cache.body, { headers: { "cache-control": "no-store" } });
  let body: PricesResponse;
  try {
    body = hermesConfigured && !PYTH_MOCK ? await fromHermes() : await fromChain();
  } catch {
    body = await fromChain().catch(nothing);
  }
  cache = { at: Date.now(), body };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
