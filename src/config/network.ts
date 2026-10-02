import { defineChain, type Address } from "viem";

/**
 * The single place for network and contract configuration. Nothing here is
 * guessed:
 * - Chain id, RPC and explorer are Robinhood Chain's, as recorded in
 *   stakeback/src/config/network.ts (official docs
 *   https://docs.robinhood.com/chain/connecting; eth_chainId = 0x1237 = 4663).
 * - The Pyth address was verified on the public RPC on 2026-09-15 (Pyth
 *   1.4.5, parsePriceFeedUpdatesUnique present, update fee 0).
 * - There is no deployed TILT contract. Until NEXT_PUBLIC_TILT_ADDRESS is
 *   set, TILT_ADDRESS is null and the site shows its normal UI with empty rounds.
 *
 * Environment values are read as literal `process.env.NEXT_PUBLIC_*`
 * properties because Next only inlines those in the browser bundle.
 */
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 4663);

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";

export const EXPLORER_URL = (process.env.NEXT_PUBLIC_EXPLORER_URL || "https://robinhoodchain.blockscout.com").replace(/\/$/, "");

export const chain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_ID === 4663 ? "Robinhood Chain" : `Local chain ${CHAIN_ID}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Blockscout", url: EXPLORER_URL } },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
  testnet: false,
});

const isAddress = (v: string | undefined): v is Address => Boolean(v && /^0x[0-9a-fA-F]{40}$/.test(v));

const tilt = process.env.NEXT_PUBLIC_TILT_ADDRESS?.trim();

/** The TILT contract. `null` means none is deployed/configured. */
export const TILT_ADDRESS: Address | null = isAddress(tilt) ? tilt : null;

/** True once a contract address is configured: only then are there rounds to read. */
export const isLive = TILT_ADDRESS !== null;

const pyth = process.env.NEXT_PUBLIC_PYTH_ADDRESS?.trim();

/** Pyth on Robinhood Chain (overridable for a local node running MockPyth). */
export const PYTH_ADDRESS: Address = isAddress(pyth) ? pyth : "0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a";

/** True when the site talks to MockPyth on a local Hardhat node (development only). */
export const PYTH_MOCK = process.env.NEXT_PUBLIC_PYTH_MOCK === "1";

export const explorer = {
  address: (a: string) => `${EXPLORER_URL}/address/${a}`,
  tx: (h: string) => `${EXPLORER_URL}/tx/${h}`,
};
