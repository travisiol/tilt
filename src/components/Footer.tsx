import { CHAIN_ID, PYTH_ADDRESS, TILT_ADDRESS, chain, explorer } from "@/config/network";
import { site } from "@/config/site";
import { shortAddress } from "@/lib/format";

export function Footer() {
  return (
    <footer className="rule mt-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 sm:px-8 md:flex-row md:items-start md:justify-between">
        <div className="max-w-md space-y-3">
          <div className="display text-[26px]" translate="no">
            {site.name}
          </div>
          <p className="text-soft">
            Up-or-down price rounds played with real ETH. You can lose your whole stake. Check that this kind of game is legal where you live
            before you play; nothing on this site checks it for you.
          </p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[15px]">
          <dt className="text-mute">Chain</dt>
          <dd className="num">
            {chain.name} · {CHAIN_ID}
          </dd>
          <dt className="text-mute">Contract</dt>
          <dd className="num">
            {TILT_ADDRESS ? (
              <a href={explorer.address(TILT_ADDRESS)} className="underline decoration-line-2 underline-offset-4 hover:text-accent-deep" target="_blank" rel="noreferrer">
                {shortAddress(TILT_ADDRESS)}
              </a>
            ) : (
              "not deployed"
            )}
          </dd>
          <dt className="text-mute">Oracle</dt>
          <dd className="num">
            <a href={explorer.address(PYTH_ADDRESS)} className="underline decoration-line-2 underline-offset-4 hover:text-accent-deep" target="_blank" rel="noreferrer">
              Pyth · {shortAddress(PYTH_ADDRESS)}
            </a>
          </dd>
        </dl>
      </div>
    </footer>
  );
}
