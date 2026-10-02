"use client";

import { ConnectButton as RainbowConnect } from "@rainbow-me/rainbowkit";
import { chain as configured } from "@/config/network";
import { shortAddress } from "@/lib/format";

/** RainbowKit's modal behind the site's own button. */
export function ConnectButton({ size = "sm", className = "" }: { size?: "sm" | "md"; className?: string }) {
  const sz = `${size === "sm" ? "btn-sm" : ""} ${className}`;
  return (
    <RainbowConnect.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const connected = mounted && account && chain;
        if (!connected) {
          return (
            <button type="button" className={`btn btn-line ${sz}`} onClick={openConnectModal} disabled={!mounted}>
              Connect wallet
            </button>
          );
        }
        if (chain.unsupported) {
          return (
            <button type="button" className={`btn btn-accent ${sz}`} onClick={openChainModal}>
              Switch to {configured.name}
            </button>
          );
        }
        return (
          <button type="button" className={`btn btn-line ${sz} num`} onClick={openAccountModal}>
            {shortAddress(account.address)}
          </button>
        );
      }}
    </RainbowConnect.Custom>
  );
}
