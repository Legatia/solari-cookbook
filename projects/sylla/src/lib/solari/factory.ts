import { z } from "zod";

import type { SolariAdapters } from "./contracts";
import {
  MockBrowserResearchAdapter,
  MockDesktopWorkspaceAdapter,
  MockSandboxEvaluationAdapter,
} from "./mock-adapters";

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const environmentSchema = z.object({
  INTEGRATION_MODE: z.enum(["mock", "live"]).default("mock"),
  SOLARI_API_KEY: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  SOLARI_BASE_URL: z.url().default("https://api.getsolari.com"),
});

export async function createSolariAdapters(
  values: Record<string, string | undefined> = process.env,
): Promise<SolariAdapters> {
  const environment = environmentSchema.parse(values);

  if (environment.INTEGRATION_MODE === "mock") {
    return {
      browser: new MockBrowserResearchAdapter(),
      desktop: new MockDesktopWorkspaceAdapter(),
      sandbox: new MockSandboxEvaluationAdapter(),
    };
  }

  if (!environment.SOLARI_API_KEY) {
    throw new Error("SOLARI_API_KEY is required when INTEGRATION_MODE=live.");
  }

  const options = {
    apiKey: environment.SOLARI_API_KEY,
    baseUrl: environment.SOLARI_BASE_URL,
  };
  const {
    SolariBrowserResearchAdapter,
    SolariDesktopWorkspaceAdapter,
    SolariSandboxEvaluationAdapter,
  } = await import("./live-adapters");

  return {
    browser: new SolariBrowserResearchAdapter(options),
    desktop: new SolariDesktopWorkspaceAdapter(options),
    sandbox: new SolariSandboxEvaluationAdapter(options),
  };
}
