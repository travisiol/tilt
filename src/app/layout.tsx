import type { Metadata } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { site } from "@/config/site";

const sans = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });

const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: `${site.name} — ${site.hook}`,
  description: site.description,
  metadataBase: new URL(site.url),
  openGraph: { title: `${site.name} — ${site.hook}`, description: site.description, type: "website" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
