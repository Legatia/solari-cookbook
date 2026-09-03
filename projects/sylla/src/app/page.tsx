import type { Metadata } from "next";

import { MarketingLanding } from "@/components/marketing-landing";

export const metadata: Metadata = {
  title: "Sylla — the intimate agent",
  description:
    "A personal agent that is yours, not the model's. It remembers what you let it, comes with you across AI models, and privately introduces people worth knowing.",
};

export default function Home() {
  return <MarketingLanding />;
}
