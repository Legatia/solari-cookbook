import type { Metadata } from "next";

import { MarketingLanding } from "@/components/marketing-landing";

export const metadata: Metadata = {
  title: "Sylla — an agent that knows you because you let it",
  description:
    "An intimate personal agent that follows you across AI models through MCP, builds trust through permissioned memory, and privately introduces people worth knowing.",
};

export default function Home() {
  return <MarketingLanding />;
}
