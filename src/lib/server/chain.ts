import { createPublicClient, http, type PublicClient } from "viem";
import { chain, RPC_URL } from "@/config/network";

let client: PublicClient | undefined;

/** One viem client for route handlers, on the same RPC the browser uses. */
export function serverClient(): PublicClient {
  if (!client) client = createPublicClient({ chain, transport: http(RPC_URL) });
  return client;
}
