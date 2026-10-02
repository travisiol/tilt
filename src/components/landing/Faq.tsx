import { LOCK_SECONDS, SETTLE_WINDOW_SECONDS, VOID_AFTER_SECONDS } from "@/config/game";
import { chain } from "@/config/network";
import { fmtSpan } from "@/lib/format";

const faq: { q: string; a: string }[] = [
  {
    q: "Who decides the result?",
    a: `Pyth's price feed, and nothing else. The contract hands the submitted update to Pyth's own contract on ${chain.name}, which only accepts the first print at or after the round's start and the first at or after its end. Whoever sends the settlement cannot pick a better-looking price.`,
  },
  {
    q: "Who settles a round?",
    a: "Anyone. Settling is a public function that needs the two Pyth updates for the round. This site offers a Settle button only when its operator has configured a Pyth key; without one it says so, and the settlement has to be sent by someone who has their own access to Pyth's price service.",
  },
  {
    q: "What if nobody settles?",
    a: `After ${fmtSpan(VOID_AFTER_SECONDS)} the round is void and every stake can be claimed back in full. The same happens if Pyth published no print within ${fmtSpan(SETTLE_WINDOW_SECONDS)} of a boundary.`,
  },
  {
    q: "What if the price does not move, or nobody takes the other side?",
    a: "Then there is no winner and no fee: every stake is refunded. A round with an empty side can be claimed back as soon as it locks.",
  },
  {
    q: "Is the payout I see when I enter guaranteed?",
    a: `No. The ticket quotes the pots as they stand with your stake added. Every stake after yours moves it, until the lock ${fmtSpan(LOCK_SECONDS)} before the end. Entering late also means the price has already moved away from the strike.`,
  },
  {
    q: "Is there an owner or an admin key?",
    a: "No. The contract has no owner, no pause and no upgrade path. The fee rate, the treasury address, the assets and the round lengths are constructor arguments and cannot be changed afterwards.",
  },
  {
    q: "Has the contract been audited?",
    a: "No. It has a test suite and nothing more. Treat it accordingly.",
  },
  {
    q: "Is this legal where I live?",
    a: "Staking real money on a price is regulated as gambling or as a financial product in many places. The site does not check where you are; that is on you.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="rule scroll-mt-20">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
        <h2 className="display text-[40px] sm:text-[56px]">Questions</h2>
        <dl className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2">
          {faq.map((f) => (
            <div key={f.q}>
              <dt className="text-[22px] font-bold leading-snug tracking-tight">{f.q}</dt>
              <dd className="mt-3 text-soft">{f.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
