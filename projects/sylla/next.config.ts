import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Solari Browser ships its own Chromium automation runtime. Keep these
  // server-only SDKs outside the Next.js route bundle so their optional
  // browser transports resolve at runtime instead of during Turbopack builds.
  serverExternalPackages: [
    "@solarisdk/browser",
    "@solarisdk/desktop",
    "@solarisdk/sandbox",
    "patchright",
    "patchright-core",
  ],
  // patchright resolves this manifest with fs at runtime, so static tracing
  // cannot discover it through the Solari SDK's pnpm symlink.
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/.pnpm/patchright-core@*/node_modules/patchright-core/browsers.json",
    ],
  },
};

export default nextConfig;
