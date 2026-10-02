# TILT

- **Name**: TILT (`src/config/site.ts` and `package.json`; nothing else spells it)
- **Hook**: "Up or down. Five minutes." (built from the shortest round in `src/config/game.ts`)
- **Palette**: warm bone `#F3EEE4` · espresso ink `#1C1410` · vermilion `#FF4A1C`. UP is the vermilion, DOWN is the ink (filled either way, no second loud colour)
- **Type**: Bricolage Grotesque (headlines and body) · JetBrains Mono (numbers), both via `next/font/google`
- **Hero object**: a two-way rocker switch (UP / DOWN) drawn in CSS, no image, no three.js
- **Design tokens**: `src/app/tokens.css`, the only file that defines colours, fonts and radii
- **Dev port**: 3817 (local Hardhat node: 8817)

Short up-or-down price rounds on Robinhood Chain, parimutuel, settled by Pyth.
Next 16 site at the root, Hardhat contracts in `contracts/`.

**Nothing is deployed.** With no contract address the site renders a truthful
pre-launch state: the rules, the assets, the reference prices it can really
read, and every staking control disabled with the reason "contract not
deployed". It shows no round, pot, player or statistic that does not exist.

## The rules (all in `contracts/contracts/Tilt.sol`, no owner)

| | |
| --- | --- |
| Assets | BTC, ETH, NVDA, TSLA, HOOD, MSTR — `src/config/game.ts` (index = on-chain asset id) |
| Round lengths | 5 min, 15 min, 1 h (`DURATIONS`, constructor argument). Rounds of a length run back to back: `start` is a multiple of the length |
| Entering | `enter(asset, duration, start, up)` with native ETH, at least 0.0001 ETH, only for the round in progress. The first stake creates the round |
| Lock | no entry in the last 30 seconds (`LOCK`) |
| Two pots | one for UP, one for DOWN |
| Strike / close | the first Pyth print at or after the start / the end, enforced by Pyth's `parsePriceFeedUpdatesUnique`; each must be published within 15 minutes of its boundary (`SETTLE_WINDOW`) |
| Settlement | `settle(roundId, startUpdate, endUpdate)` by anyone once the round has ended. Boundary prints are stored (`priceAt`), so the close of a round is the strike of the next and needs no second update |
| Decisive round | close > strike: the UP pot shares both pots pro rata; close < strike: the DOWN pot does |
| Fee | 2 % of both pots (`FEE_BPS`, constructor argument, max 5 %), on a decisive round only, capped at the losing pot so a winner never gets back less than the stake. `sweepFees()` by anyone sends it to the treasury |
| Refund | close == strike, or one pot empty: every stake is refunded, no fee. A one-sided round is claimable as soon as it locks, without any price |
| Void | not settled 24 hours after its end (`VOID_AFTER`): it can no longer be settled and every stake is refunded, no fee |
| Claims | `claim(roundId, account)` / `claimMany(ids, account)`: anyone may trigger, the money goes to `account`. No deadline |

Prices are compared in 1e-8 USD whatever the feed's exponent. Stocks use
Pyth's 24/7 feeds (`Equity.Index.X/USD`), so rounds also run outside market hours.

What TILT does **not** have, and so does not claim: other market types, a
token, revenue sharing, referrals, a leaderboard, a claim expiry.

## Layout

```
contracts/
  contracts/Tilt.sol              the whole game (enter · pin · settle · claim · sweepFees)
  contracts/interfaces/IPyth.sol  the Pyth slice used (exact pyth-sdk signatures)
  contracts/mocks/MockPyth.sol    Pyth stand-in for tests and a local node
  test/Tilt.test.ts               24 tests
  scripts/deploy.ts               deploy (local or Robinhood Chain) → deployments/<network>.json
src/
  config/game.ts                  assets, round lengths, lock, fee, minimum stake (site + deploy script + tests)
  config/network.ts               chain, RPC, explorer, Pyth address, TILT address (null by default)
  config/site.ts                  name and hook
  app/                            / (landing) · /rounds/[symbol] · /api/prices · /api/pyth/update · /api/dev/warp
  app/tokens.css                  design tokens
  components/Rocker.tsx           the hero switch
  components/rounds/              RoundScreen · Ticket · PastRounds (settle) · MyPositions (claim)
  lib/rounds.ts                   the contract's payout arithmetic for quotes
  lib/hermes.ts                   server-side Hermes client (the key never reaches the browser)
scripts/
  capture.mjs                     screenshots with headless Chrome → shots/
  play-local.mjs                  plays a whole round in headless Chrome against a local node
```

## Running it

```bash
npm install && npm --prefix contracts install
npm test                 # = npm --prefix contracts test → 24 passing (also re-exports the ABI to src/lib/abi)
npm run dev              # http://localhost:3817, pre-launch state
```

### Reference prices

`/api/prices` returns the latest Pyth prints from Hermes when `PYTH_API_KEY`
is set. Without a key it reads the Pyth contract on chain (`getPriceUnsafe`):
that print is only as recent as the last time someone pushed one, so the site
shows its date, and "Price unavailable" for a feed nobody has ever pushed
(the four stocks, when this was written).

### Settlement needs a Pyth key

Pyth's Hermes service has required an API key since 2026-08-26
(https://pythdata.app/signup, free trial then paid). The site's Settle button
fetches the two boundary updates through `/api/pyth/update`, which needs
`PYTH_API_KEY` **on the server** (never `NEXT_PUBLIC_`). Without it:

- the route answers 503 with the reason;
- the round page says "Settlement is unavailable on this site" and disables
  the button instead of failing;
- anyone can still call `settle()` directly with updates from their own
  Hermes access, and unsettled rounds refund after 24 hours.

### Playing a round locally (development only)

```bash
npm --prefix contracts run node            # Hardhat node on :8817, chain 31337
npm --prefix contracts run deploy:local    # MockPyth + Multicall3 + Tilt; prints the environment
# start the site with the printed variables in the environment (do not keep them in .env.local):
NEXT_PUBLIC_TILT_ADDRESS=… NEXT_PUBLIC_CHAIN_ID=31337 NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8817 \
  NEXT_PUBLIC_PYTH_ADDRESS=… NEXT_PUBLIC_PYTH_MOCK=1 npm run dev
node scripts/play-local.mjs                # connect → stake UP → stake DOWN → end → settle → claim
```

With `NEXT_PUBLIC_PYTH_MOCK=1` (ignored on chain 4663) `/api/pyth/update`
builds MockPyth updates from the mock's stored price and `/api/dev/warp`
moves the local clock. Neither exists against the real chain.

## Before launch (owner)

1. Decide the **treasury** address (receives the fee, fixed forever) and
   confirm `FEE_BPS`, `DURATIONS` and `ASSETS` in `src/config/game.ts`: all
   four are constructor arguments, changing them later means a new contract.
2. `contracts/.env` from `.env.example`: `DEPLOYER_PRIVATE_KEY`, `TREASURY`,
   `PYTH_ADDRESS` (already the verified Robinhood Chain address). Fund the
   deployer with ETH on Robinhood Chain.
3. `npm --prefix contracts run deploy:robinhood` → prints `NEXT_PUBLIC_TILT_ADDRESS=…`.
4. Site environment: `NEXT_PUBLIC_TILT_ADDRESS`, `PYTH_API_KEY` (needed for
   live prices and for the Settle button), `NEXT_PUBLIC_SITE_URL`, optional
   `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (without it only injected browser
   wallets are offered) and `HERMES_URL`.
5. Someone has to settle: players can from the site once the key is set; a
   small keeper calling `settle()` for ended rounds is advisable and is not
   written yet.

## What has been verified

- 24 Hardhat tests on `Tilt.sol`: schedule and lock, both outcomes with exact
  payouts, fee cap, flat refund, one-sided refund, void, claim replays,
  `claimMany`, fee sweep, Pyth first-print rule against `MockPyth`, Pyth fee
  forwarding, and that the constants printed by the site equal the contract's.
- `npx eslint .`, `npx tsc --noEmit`, `npx next build`.
- Pre-launch pages at 1536 px and 390 px (`shots/home-*.png`, `shots/rounds-*.png`),
  no horizontal overflow. The BTC and ETH reference prices in those shots were
  read from the real Pyth contract on Robinhood Chain.
- One whole round played in headless Chrome against a local Hardhat node
  through the site's buttons with a stub wallet (`shots/play-local.log`,
  `shots/rounds-*-local-*.png`): two stakes, settle, claim of 0.0118 ETH, which
  matches the contract arithmetic (pots 0.01 / 0.05, fee 0.0012).
- The "no Pyth key" state on a live contract (`shots/rounds-*-local-nokey.png`).

## Not verified

- A real wallet, a real Hermes key (the Hermes path of `/api/prices` and
  `/api/pyth/update` has never run), gas and behaviour on Robinhood Chain.
- That Pyth publishes a print for every boundary second of the 24/7 stock
  feeds at night and on weekends; if it does not within 15 minutes, the round
  cannot be settled and refunds after 24 hours.
- No audit. Rounding dust (a few wei per decisive round) stays in the contract.
- Legal: real-money price betting is regulated in most places; the site says
  so and does not geo-block anyone.
