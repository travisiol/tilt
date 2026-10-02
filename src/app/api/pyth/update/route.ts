import { NextResponse, type NextRequest } from "next/server";
import { encodeAbiParameters, parseAbi } from "viem";
import { ASSETS, DURATIONS, assetIndex } from "@/config/game";
import { CHAIN_ID, PYTH_ADDRESS, PYTH_MOCK } from "@/config/network";
import { fetchAt, hermesConfigured } from "@/lib/hermes";
import { serverClient } from "@/lib/server/chain";

export const dynamic = "force-dynamic";

/**
 * Pyth update data for one round boundary: the first print at or after `at`.
 * A settlement needs two of them (the round's start and its end). Served
 * through the site so the Hermes key never reaches the browser; anyone with
 * their own key can skip this and call the contract directly.
 *
 * Development only: against a local Hardhat node running MockPyth
 * (NEXT_PUBLIC_PYTH_MOCK=1, never on chain 4663) the update is built here
 * from the price stored in the mock, nudged by a fixed pattern, so a round
 * can be played end to end without a key. Real Pyth rejects such an update.
 */
export type UpdateResponse = { data: `0x${string}`[]; publishTime: number; price: number; source: "hermes" | "mock" };

const mockAbi = parseAbi(["function getPriceUnsafe(bytes32 id) view returns ((int64 price, uint64 conf, int32 expo, uint256 publishTime))"]);
const mockBase = new Map<number, number>();
const STEP = Math.min(...DURATIONS);

async function mockUpdate(asset: number, at: number): Promise<UpdateResponse> {
  const a = ASSETS[asset];
  let base = mockBase.get(asset);
  if (base === undefined) {
    const stored = await serverClient().readContract({ address: PYTH_ADDRESS, abi: mockAbi, functionName: "getPriceUnsafe", args: [a.feedId] });
    base = Number(stored.price) * 10 ** stored.expo;
    mockBase.set(asset, base);
  }
  const h = ((Math.floor(at / STEP) * 7 + asset * 3) % 11) - 5; // -5..5, changes at every boundary
  const price = base * (1 + h * 0.0004);
  const data = encodeAbiParameters(
    [{ type: "bytes32" }, { type: "int64" }, { type: "uint64" }, { type: "int32" }, { type: "uint64" }, { type: "uint64" }],
    [a.feedId, BigInt(Math.round(price * 1e8)), 0n, -8, BigInt(at), BigInt(at - 1)],
  );
  return { data: [data], publishTime: at, price, source: "mock" };
}

export async function GET(req: NextRequest) {
  const asset = assetIndex(req.nextUrl.searchParams.get("asset") ?? "");
  if (asset < 0) return NextResponse.json({ error: "unknown asset" }, { status: 400 });
  const at = Number(req.nextUrl.searchParams.get("at"));
  if (!Number.isInteger(at) || at <= 0) return NextResponse.json({ error: "at: unix seconds" }, { status: 400 });
  if (at > Math.floor(Date.now() / 1000) + 86_400) return NextResponse.json({ error: "that second has not happened yet" }, { status: 400 });

  try {
    if (PYTH_MOCK && CHAIN_ID !== 4663) return NextResponse.json(await mockUpdate(asset, at), { headers: { "cache-control": "no-store" } });
    if (!hermesConfigured) {
      return NextResponse.json(
        { error: "This site has no Pyth Hermes key (PYTH_API_KEY), so it cannot fetch price updates. Anyone can still settle by calling the contract with their own update." },
        { status: 503 },
      );
    }
    const upd = await fetchAt(ASSETS[asset].feedId, at);
    const p = upd.parsed[0];
    if (!p || upd.data.length === 0) return NextResponse.json({ error: "Pyth has no print for that second yet" }, { status: 404 });
    const body: UpdateResponse = { data: upd.data, publishTime: p.publishTime, price: p.price, source: "hermes" };
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
