import type { NextConfig } from "next";

/**
 * wagmi's Base Account connector dynamically imports `@base-org/account`,
 * whose Node build reaches for optional `@x402/*` payment packages that are
 * not installed and never executed here. The bundler still tries to resolve
 * them, so they are aliased to src/lib/empty.cjs, a CommonJS stub whose
 * exports are not statically known (an ES module stub fails the build).
 */
const OPTIONAL_MODULES = [
  "@x402/core",
  "@x402/core/client",
  "@x402/core/server",
  "@x402/evm",
  "@x402/evm/exact/client",
  "@x402/evm/exact/server",
  "@x402/evm/upto/client",
  "@x402/evm/upto/server",
  "@x402/svm",
  "@x402/svm/exact/client",
  "@x402/svm/exact/server",
  "@x402/express",
  "@x402/extensions/bazaar",
  "@x402/fetch",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  turbopack: {
    resolveAlias: Object.fromEntries(OPTIONAL_MODULES.map((name) => [name, "./src/lib/empty.cjs"])),
  },
};

export default nextConfig;
