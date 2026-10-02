import { connectorsForWallets, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http, type Config } from "wagmi";
import { chain } from "@/config/network";
import { site } from "@/config/site";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();

const transports = { [chain.id]: http() };

/**
 * With a WalletConnect project id: RainbowKit's full default wallet list.
 * Without one: injected browser wallets only, so the app works out of the box.
 */
export const wagmiConfig: Config = projectId
  ? getDefaultConfig({
      appName: site.name,
      appDescription: site.description,
      appUrl: site.url,
      projectId,
      chains: [chain],
      transports,
      ssr: true,
    })
  : createConfig({
      chains: [chain],
      connectors: connectorsForWallets([{ groupName: "Browser wallets", wallets: [injectedWallet] }], {
        appName: site.name,
        projectId: "injected-only",
      }),
      transports,
      ssr: true,
    });
