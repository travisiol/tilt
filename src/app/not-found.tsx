import Link from "next/link";
import { Nav } from "@/components/Nav";

export default function NotFound() {
  return (
    <>
      <Nav />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-start justify-center gap-5 px-5 py-24 sm:px-8">
        <h1 className="display text-5xl">Nothing here.</h1>
        <p className="text-soft">That page does not exist, or that asset has no rounds.</p>
        <Link href="/" className="btn btn-ink">
          Back to the start
        </Link>
      </main>
    </>
  );
}
