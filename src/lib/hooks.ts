"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { zeroAddress } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import type { PricesResponse } from "@/app/api/prices/route";
import type { UpdateResponse } from "@/app/api/pyth/update/route";
import { FEE_BPS } from "@/config/game";
import { TILT_ADDRESS, isLive } from "@/config/network";
import { tiltAbi } from "./abi/tilt";
import type { PositionView, RoundView } from "./rounds";

const contract = { address: TILT_ADDRESS ?? undefined, abi: tiltAbi } as const;

/** Reference prices from the site's own route (Hermes with a key, the on-chain Pyth contract without). */
export function usePrices() {
  return useQuery<PricesResponse>({
    queryKey: ["prices"],
    queryFn: async () => {
      const res = await fetch("/api/prices", { cache: "no-store" });
      if (!res.ok) throw new Error(`prices ${res.status}`);
      return (await res.json()) as PricesResponse;
    },
    refetchInterval: 5_000,
    staleTime: 2_000,
  });
}

/** The fee the deployed contract charges; the configured value until there is a contract to ask. */
export function useFeeBps(): { feeBps: number; fromContract: boolean } {
  const q = useReadContract({ ...contract, functionName: "feeBps", query: { enabled: isLive, staleTime: Infinity } });
  return q.data !== undefined ? { feeBps: Number(q.data), fromContract: true } : { feeBps: FEE_BPS, fromContract: false };
}

export type RoundState = {
  /** 0 when nobody has entered the round: it does not exist on chain. */
  id: bigint;
  round?: RoundView;
  /** The print stored on chain for the round's start (1e-8 USD), 0 if none. */
  strike: bigint;
  position?: PositionView;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

/** The round (asset, duration, start), its strike if stored, and the connected wallet's position in it. */
export function useRound(asset: number, duration: number, start: number): RoundState {
  const { address } = useAccount();
  const enabled = isLive && start > 0;
  const head = useReadContracts({
    contracts: [
      { ...contract, functionName: "roundIdOf", args: [asset, duration, BigInt(start)] },
      { ...contract, functionName: "priceAt", args: [asset, BigInt(start)] },
    ],
    query: { enabled, refetchInterval: 4_000 },
  });
  const id = (head.data?.[0]?.result as bigint | undefined) ?? 0n;
  const strike = (head.data?.[1]?.result as bigint | undefined) ?? 0n;
  const detail = useReadContracts({
    contracts: [
      { ...contract, functionName: "getRound", args: [id] },
      { ...contract, functionName: "positionOf", args: [id, address ?? zeroAddress] },
    ],
    query: { enabled: enabled && id > 0n, refetchInterval: 4_000 },
  });
  const round = id > 0n ? (detail.data?.[0]?.result as RoundView | undefined) : undefined;
  const position = id > 0n && address ? (detail.data?.[1]?.result as PositionView | undefined) : undefined;
  return {
    id,
    round,
    strike,
    position,
    isLoading: enabled && (head.isLoading || (id > 0n && detail.isLoading)),
    isError: head.isError || detail.isError || head.data?.[0]?.status === "failure",
    refetch: () => {
      void head.refetch();
      void detail.refetch();
    },
  };
}

export type PastRound = { start: number; id: bigint; round: RoundView };

/** The rounds that exist among the `count` slots before `currentStart`, newest first. */
export function usePastRounds(asset: number, duration: number, currentStart: number, count = 12) {
  const starts = useMemo(
    () => (currentStart > 0 ? Array.from({ length: count }, (_, k) => currentStart - (k + 1) * duration) : []),
    [currentStart, duration, count],
  );
  const ids = useReadContracts({
    contracts: starts.map((s) => ({ ...contract, functionName: "roundIdOf", args: [asset, duration, BigInt(s)] }) as const),
    query: { enabled: isLive && starts.length > 0, refetchInterval: 8_000 },
  });
  const found = useMemo(
    () => starts.map((s, i) => ({ start: s, id: (ids.data?.[i]?.result as bigint | undefined) ?? 0n })).filter((x) => x.id > 0n),
    [starts, ids.data],
  );
  const rounds = useReadContracts({
    contracts: found.map((f) => ({ ...contract, functionName: "getRound", args: [f.id] }) as const),
    query: { enabled: isLive && found.length > 0, refetchInterval: 8_000 },
  });
  const list: PastRound[] = useMemo(
    () =>
      found.flatMap((f, i) => {
        const round = rounds.data?.[i]?.result as RoundView | undefined;
        return round ? [{ ...f, round }] : [];
      }),
    [found, rounds.data],
  );
  return {
    rounds: list,
    isLoading: isLive && (ids.isLoading || (found.length > 0 && rounds.isLoading)),
    isError: ids.isError || rounds.isError,
    refetch: () => {
      void ids.refetch();
      void rounds.refetch();
    },
  };
}

export type MyRound = { id: bigint; round: RoundView; position: PositionView; owed: bigint };

const MY_ROUNDS = 30;

/** The connected wallet's most recent rounds (up to 30), newest first, with what each owes it now. */
export function useMyRounds() {
  const { address } = useAccount();
  const enabled = isLive && Boolean(address);
  const who = address ?? zeroAddress;
  const count = useReadContract({ ...contract, functionName: "roundsCountOf", args: [who], query: { enabled, refetchInterval: 6_000 } });
  const total = count.data ?? 0n;
  const from = total > BigInt(MY_ROUNDS) ? total - BigInt(MY_ROUNDS) : 0n;
  const ids = useReadContract({
    ...contract,
    functionName: "roundsOf",
    args: [who, from, BigInt(MY_ROUNDS)],
    query: { enabled: enabled && total > 0n, refetchInterval: 6_000 },
  });
  const list = useMemo(() => [...(ids.data ?? [])].reverse(), [ids.data]);
  const detail = useReadContracts({
    contracts: list.flatMap(
      (id) =>
        [
          { ...contract, functionName: "getRound", args: [id] },
          { ...contract, functionName: "positionOf", args: [id, who] },
          { ...contract, functionName: "owed", args: [id, who] },
        ] as const,
    ),
    query: { enabled: enabled && list.length > 0, refetchInterval: 6_000 },
  });
  const rounds: MyRound[] = useMemo(() => {
    if (!detail.data) return [];
    return list.flatMap((id, i) => {
      const round = detail.data[i * 3]?.result as RoundView | undefined;
      const position = detail.data[i * 3 + 1]?.result as PositionView | undefined;
      const owed = (detail.data[i * 3 + 2]?.result as bigint | undefined) ?? 0n;
      return round && position ? [{ id, round, position, owed }] : [];
    });
  }, [detail.data, list]);
  return {
    rounds,
    total: Number(total),
    shown: MY_ROUNDS,
    isLoading: enabled && (count.isLoading || (total > 0n && (ids.isLoading || detail.isLoading))),
    isError: count.isError || ids.isError || detail.isError,
    refetch: () => {
      void count.refetch();
      void ids.refetch();
      void detail.refetch();
    },
  };
}

/**
 * The print at a round's start, asked from the site's Pyth route. Only
 * requested when the site can serve it (a Hermes key, or the local mock) and
 * the chain does not already store it.
 */
export function useStrikePrint(symbol: string, start: number, enabled: boolean) {
  return useQuery<UpdateResponse>({
    queryKey: ["strike", symbol, start],
    queryFn: async () => {
      const res = await fetch(`/api/pyth/update?asset=${symbol}&at=${start}`, { cache: "no-store" });
      const body = (await res.json()) as UpdateResponse & { error?: string };
      if (!res.ok || body.error) throw new Error(body.error ?? `update ${res.status}`);
      return body;
    },
    enabled: enabled && start > 0,
    staleTime: Infinity,
    retry: 2,
    retryDelay: 3_000,
  });
}
