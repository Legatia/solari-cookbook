import type { Metadata } from "next";

import { SyllaShell } from "@/components/sylla-shell";

export const metadata: Metadata = {
  title: "Your agent — Sylla",
  description: "Open your private Sylla agent and inspect what it knows.",
};

export default function AgentApp() {
  return <SyllaShell />;
}
