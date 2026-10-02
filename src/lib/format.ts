import { formatEther } from "viem";

export function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** A price held in 1e-8 USD units (the contract's unit) → "$79,720.01". */
export function fmtUnits(units: bigint): string {
  return fmtUsd(Number(units) / 1e8);
}

/** Dollar price: two decimals, four under one dollar. */
export function fmtUsd(v: number): string {
  const decimals = v < 1 ? 4 : 2;
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtEth(wei: bigint, digits = 4): string {
  const v = Number(formatEther(wei));
  if (v === 0) return "0 ETH";
  if (v < 0.0001) return "<0.0001 ETH";
  return `${v.toLocaleString("en-US", { maximumFractionDigits: digits })} ETH`;
}

/** "×1.96" — what one unit staked returns. */
export function fmtMultiple(x: number): string {
  if (!isFinite(x) || x <= 0) return "—";
  if (x >= 100) return `×${Math.round(x)}`;
  return `×${x.toFixed(2)}`;
}

/** "12:05:00" in UTC. */
export function fmtClock(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" });
}

/** "2 Oct, 12:05" in UTC. */
export function fmtDateTime(ts: number): string {
  const d = new Date(ts * 1000);
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const t = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${day}, ${t}`;
}

/** "4 Sep 2026" in UTC. */
export function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "04:12" / "1:02:07" — a countdown; "00:00" once passed. */
export function fmtCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = sec.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "24 hours" / "15 minutes" / "30 seconds" */
export function fmtSpan(seconds: number): string {
  const unit = (n: number, u: string) => `${n} ${u}${n === 1 ? "" : "s"}`;
  if (seconds % 3600 === 0) return unit(seconds / 3600, "hour");
  if (seconds % 60 === 0) return unit(seconds / 60, "minute");
  return unit(seconds, "second");
}
