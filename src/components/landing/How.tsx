import { DURATIONS, LOCK_SECONDS, MIN_STAKE_WEI, durationLabel } from "@/config/game";
import { fmtEth } from "@/lib/format";

const shortest = Math.min(...DURATIONS);

const steps = [
  {
    title: "The clock opens it",
    body: `Rounds run back to back on a fixed grid: a ${durationLabel(shortest)} round starts every ${durationLabel(shortest)}, counted from midnight UTC. Nobody opens or closes them.`,
  },
  {
    title: "You pick a side",
    body: `While a round runs, stake ETH on UP or on DOWN. Each side has its own pot. The smallest stake is ${fmtEth(MIN_STAKE_WEI)}.`,
  },
  {
    title: "It locks",
    body: `Entries stop ${LOCK_SECONDS} seconds before the end. From then on the two pots cannot change.`,
  },
  {
    title: "Two prints decide",
    body: "The strike is the first Pyth price at or after the start, the close is the first one at or after the end. Close above strike pays UP, below pays DOWN.",
  },
];

export function How() {
  const lockShare = (LOCK_SECONDS / shortest) * 100;
  return (
    <section id="how" className="rule scroll-mt-20">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
        <h2 className="display text-[40px] sm:text-[56px]">How a round works</h2>
        <ol className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title}>
              <div className="num text-[18px] font-medium text-accent-deep">{i + 1}</div>
              <h3 className="mt-3 text-[24px] font-bold leading-tight tracking-tight">{s.title}</h3>
              <p className="mt-3 text-soft">{s.body}</p>
            </li>
          ))}
        </ol>

        {/* one round of the shortest length, to scale */}
        <figure className="card mt-16 p-6 sm:p-8">
          <figcaption className="text-[16px] text-soft">One {durationLabel(shortest)} round, to scale</figcaption>
          <div className="mt-5 flex h-12 overflow-hidden rounded-xl">
            <div className="flex items-center bg-accent px-4 text-[16px] font-semibold text-ink" style={{ width: `${100 - lockShare}%` }}>
              Open for entries
            </div>
            <div className="bg-ink" style={{ width: `${lockShare}%` }} aria-label={`Locked for the last ${LOCK_SECONDS} seconds`} />
          </div>
          <div className="num mt-3 flex justify-between gap-4 text-[15px] text-soft">
            <span>
              start
              <br />
              <span className="text-ink">strike print</span>
            </span>
            <span className="text-right">
              last {LOCK_SECONDS} s locked · end
              <br />
              <span className="text-ink">close print</span>
            </span>
          </div>
        </figure>
      </div>
    </section>
  );
}
