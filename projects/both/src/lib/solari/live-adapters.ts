import { Solari } from "@solarisdk/browser";
import { DesktopClient } from "@solarisdk/desktop";
import { SandboxClient } from "@solarisdk/sandbox";

import {
  directionalEvaluationRequestSchema,
  directionalEvaluationSchema,
  researchRequestSchema,
  researchResultSchema,
  workspaceManifestSchema,
  workspaceResultSchema,
  type BrowserResearchAdapter,
  type DesktopWorkspaceAdapter,
  type SandboxEvaluationAdapter,
} from "./contracts";
import { assertPublicHttpUrl } from "./url-policy";

interface LiveAdapterOptions {
  apiKey: string;
  baseUrl: string;
}

const sandboxEvaluatorScript = `
const fs = require("node:fs");
const input = JSON.parse(fs.readFileSync("/tmp/both-input.json", "utf8"));
const first = input.participantObservations[0];
const second = input.candidateObservations[0];
const result = {
  recommend: Boolean(first && second),
  rationale: first && second ? [{
    statement: "Their approved context supports one bounded conversation worth testing.",
    supportingObservationIds: [first.id, second.id]
  }] : [],
  uncertainty: "high",
  caution: "This deterministic sandbox baseline validates isolation and wiring; it is not the final personal-agent evaluator.",
  evaluator: "sandbox-baseline"
};
process.stdout.write(JSON.stringify(result));
`;

function excerpt(value: string, maxLength = 700) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

async function waitForDesktopReady(
  desktop: Awaited<ReturnType<DesktopClient["create"]>>,
  attempts = 30,
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const health = await desktop.health();

    if (health.ready) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error("Solari Desktop did not become ready within 30 seconds.");
}

export class SolariBrowserResearchAdapter implements BrowserResearchAdapter {
  constructor(private readonly options: LiveAdapterOptions) {}

  async research(input: unknown) {
    const request = researchRequestSchema.parse(input);
    const sources = request.sources.map((source) => ({
      ...source,
      url: assertPublicHttpUrl(source.url).toString(),
    }));
    const client = new Solari(this.options);
    const browser = await client.launch({ recording: true });
    const runReference = browser.id;

    try {
      const evidence = [];

      for (const source of sources) {
        const page = await browser.newPage();

        try {
          await page.goto(source.url, {
            waitUntil: "domcontentloaded",
            timeout: 20_000,
          });
          const [sourceTitle, bodyText] = await Promise.all([
            page.title(),
            page
              .locator("body")
              .innerText({ timeout: 15_000 })
              .catch(() => ""),
          ]);

          evidence.push({
            sourceId: source.id,
            sourceUrl: page.url(),
            sourceTitle: sourceTitle || source.label || new URL(source.url).hostname,
            excerpt: excerpt(bodyText),
            observedAt: new Date().toISOString(),
          });
        } finally {
          await page.close();
        }
      }

      return researchResultSchema.parse({
        provider: "solari",
        runReference,
        evidence,
      });
    } finally {
      await browser.close();
      await client.close();
    }
  }
}

export class SolariDesktopWorkspaceAdapter
  implements DesktopWorkspaceAdapter
{
  private readonly client: DesktopClient;

  constructor(options: LiveAdapterOptions) {
    this.client = new DesktopClient(options);
  }

  async provision(input: unknown) {
    const manifest = workspaceManifestSchema.parse(input);
    const desktop = await this.client.create({
      template: "default",
      resolution: "1440x900",
      cpu: 2,
      memMb: 3072,
      timeoutMs: 15 * 60 * 1000,
      lifecycle: { onTimeout: "pause", autoResume: true },
      metadata: {
        product: "both",
        participantRef: manifest.participantRef,
      },
    });

    try {
      await desktop.connect();
      await waitForDesktopReady(desktop);

      const workspacePath = "/home/oai/share/both";
      await desktop.exec("mkdir", { args: ["-p", workspacePath] });
      await desktop.fs.write(
        `${workspacePath}/workspace.json`,
        JSON.stringify(manifest, null, 2),
      );

      return workspaceResultSchema.parse({
        provider: "solari",
        sessionId: desktop.sessionId,
        status: "ready",
        streamCapability: desktop.streamUrl,
      });
    } catch (error) {
      await this.client.destroy(desktop.sessionId);
      throw error;
    } finally {
      desktop.close();
    }
  }

  async pause(sessionId: string) {
    await this.client.pause(sessionId);
  }

  async destroy(sessionId: string) {
    await this.client.destroy(sessionId);
  }
}

export class SolariSandboxEvaluationAdapter
  implements SandboxEvaluationAdapter
{
  private readonly client: SandboxClient;

  constructor(options: LiveAdapterOptions) {
    this.client = new SandboxClient(options);
  }

  async evaluate(input: unknown) {
    const request = directionalEvaluationRequestSchema.parse(input);
    const sandbox = await this.client.create({
      template: "base",
      cpu: 1,
      memMb: 2048,
      timeoutMs: 5 * 60 * 1000,
      lifecycle: { onTimeout: "kill" },
      metadata: {
        product: "both",
        direction: request.direction,
      },
    });

    try {
      await sandbox.connect();
      await sandbox.files.write(
        "/tmp/both-input.json",
        JSON.stringify(request),
      );
      const result = await sandbox.commands.run("node", {
        args: ["-e", sandboxEvaluatorScript],
        timeoutMs: 30_000,
      });

      if (result.exitCode !== 0) {
        throw new Error(`Sandbox evaluator failed: ${result.stderr}`);
      }

      return directionalEvaluationSchema.parse(JSON.parse(result.stdout));
    } finally {
      await this.client.kill(sandbox.id);
    }
  }
}
