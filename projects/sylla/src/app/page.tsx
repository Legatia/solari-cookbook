import type { Metadata } from "next";

import { MarketingLanding } from "@/components/marketing-landing";

export const metadata: Metadata = {
  title: "Sylla — your deal book, in the AI you already use",
  description:
    "A private agent for founders and investors, run from inside ChatGPT or Claude. It keeps a record on everyone you deal with, researches them on real browsers, and carries on after you close the chat.",
};

export default function Home() {
  return <MarketingLanding />;
}
