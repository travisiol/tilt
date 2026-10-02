import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { RoundScreen } from "@/components/rounds/RoundScreen";
import { ASSETS, DURATIONS, assetIndex, durationLabel } from "@/config/game";
import { site } from "@/config/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return ASSETS.map((a) => ({ symbol: a.symbol.toLowerCase() }));
}

export async function generateMetadata({ params }: PageProps<"/rounds/[symbol]">): Promise<Metadata> {
  const { symbol } = await params;
  const i = assetIndex(symbol);
  if (i < 0) return {};
  const a = ASSETS[i];
  return {
    title: `${a.symbol} up or down — ${site.name}`,
    description: `${a.name} price rounds of ${DURATIONS.map((d) => durationLabel(d)).join(", ")}: stake ETH on UP or DOWN, settled by two Pyth prints.`,
  };
}

export default async function RoundsPage({ params }: PageProps<"/rounds/[symbol]">) {
  const { symbol } = await params;
  const i = assetIndex(symbol);
  if (i < 0) notFound();
  return (
    <>
      <Nav />
      <main className="flex-1">
        <RoundScreen asset={i} />
      </main>
      <Footer />
    </>
  );
}
