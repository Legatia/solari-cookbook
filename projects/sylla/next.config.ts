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
};

export default nextConfig;
