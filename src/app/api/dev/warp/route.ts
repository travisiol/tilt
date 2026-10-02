import { NextResponse, type NextRequest } from "next/server";
import { CHAIN_ID, PYTH_MOCK } from "@/config/network";
import { serverClient } from "@/lib/server/chain";

export const dynamic = "force-dynamic";

/**
 * Development only: clock control for a local Hardhat node, available only
 * when the site runs against MockPyth and never on chain 4663.
 * POST { to: <unix seconds> } mines a block at that time (never backwards),
 * so a round can be played to its end without waiting for it.
 */
export async function POST(req: NextRequest) {
  if (!PYTH_MOCK || CHAIN_ID === 4663) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { to?: number };
  const to = Number(body.to);
  if (!Number.isInteger(to)) return NextResponse.json({ error: "to: unix seconds" }, { status: 400 });
  const client = serverClient();
  const latest = await client.getBlock();
  if (to > Number(latest.timestamp)) {
    await client.request({ method: "evm_setNextBlockTimestamp" as never, params: [to] as never });
  }
  await client.request({ method: "evm_mine" as never, params: [] as never });
  const block = await client.getBlock();
  return NextResponse.json({ now: Number(block.timestamp) });
}
