import type { Metadata } from "next";

import { MarketingLanding } from "@/components/marketing-landing";

export const metadata: Metadata = {
  title: "Sylla — meet who you’re missing",
  description:
    "A portable personal agent that learns with your permission and helps you discover the people you may genuinely want to meet.",
};

export default function Home() {
  return <MarketingLanding />;
}
