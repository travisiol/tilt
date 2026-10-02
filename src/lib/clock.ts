"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useBlock } from "wagmi";

/**
 * One shared clock, in whole seconds. It is 0 on the server and on the first
 * client render (so nothing time-dependent is in the HTML), then ticks.
 * `offset` aligns it on the chain's clock once a block has been read.
 */
let offset = 0;
let cached = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function tick() {
  const v = Math.floor(Date.now() / 1000 + offset);
  if (v !== cached) {
    cached = v;
    listeners.forEach((l) => l());
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(tick, 250);
    tick();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/**
 * The latest block can be old (a quiet chain mines no block), so it can only
 * prove the chain is AHEAD of this machine's clock, never behind it: the
 * offset only ever grows. A reload starts again from zero.
 */
function setChainTime(chainSeconds: number) {
  const seen = chainSeconds - Date.now() / 1000;
  if (seen > offset) {
    offset = seen;
    tick();
  }
}

/** Seconds since the epoch, ticking; 0 until the page is live in the browser. */
export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => cached,
    () => 0,
  );
}

/**
 * Aligns the shared clock on the latest block's timestamp. Rounds lock and
 * end on chain time, which is a second or two off the wall clock on a real
 * network and can be far off on a local node.
 */
export function useChainClock(enabled: boolean) {
  const { data: block } = useBlock({ query: { enabled, refetchInterval: 5_000 } });
  const stamp = block?.timestamp;
  useEffect(() => {
    if (stamp !== undefined) setChainTime(Number(stamp));
  }, [stamp]);
}
