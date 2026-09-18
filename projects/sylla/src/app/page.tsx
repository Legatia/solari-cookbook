import type { Metadata } from "next";

import { MarketingLanding } from "@/components/marketing-landing";

export const metadata: Metadata = {
  title: "Sylla — the intimate agent",
  description:
    "A private, portable personal agent that lives inside the AI you already use, remembers with permission, works while you are away, and makes private introductions through a society of agents.",
};

export default function Home() {
  return <MarketingLanding />;
}
