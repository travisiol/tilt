import { DURATIONS, durationWords } from "./game";

const shortest = Math.min(...DURATIONS);
const words = durationWords(shortest);

/** Everything that names the product lives here (and in package.json). */
export const site = {
  name: "TILT",
  /** "Up or down. Five minutes." — follows the shortest round in src/config/game.ts. */
  hook: `Up or down. ${words[0].toUpperCase()}${words.slice(1)}.`,
  description:
    "Short up-or-down price rounds on Robinhood Chain. Stake ETH on UP or DOWN; two Pyth prints decide; the winning pot shares both pots. No owner, no operator.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3817",
} as const;
