import { Footer } from "@/components/Footer";
import { Assets } from "@/components/landing/Assets";
import { Faq } from "@/components/landing/Faq";
import { Hero } from "@/components/landing/Hero";
import { How } from "@/components/landing/How";
import { Rules } from "@/components/landing/Rules";
import { Nav } from "@/components/Nav";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <How />
        <Rules />
        <Assets />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
