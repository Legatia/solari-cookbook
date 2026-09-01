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
  type WorkspaceManifest,
} from "./contracts";
import { assertPublicHttpUrl } from "./url-policy";

interface LiveAdapterOptions {
  apiKey: string;
  baseUrl: string;
}

const sandboxEvaluatorScript = `
const fs = require("node:fs");
const input = JSON.parse(fs.readFileSync("/tmp/sylla-input.json", "utf8"));
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function workspaceDocument(manifest: WorkspaceManifest) {
  const memories = manifest.observations
    .map(
      (observation, index) => `
        <article class="memory">
          <div class="memory-index">${String(index + 1).padStart(2, "0")}</div>
          <div>
            <div class="meta">${escapeHtml(observation.origin.replaceAll("_", " "))} · ${escapeHtml(observation.visibility)}</div>
            <h2>${escapeHtml(observation.claim)}</h2>
            ${observation.evidenceExcerpt ? `<p>${escapeHtml(observation.evidenceExcerpt)}</p>` : ""}
            ${observation.sourceTitle ? `<div class="source">Source · ${escapeHtml(observation.sourceTitle)}</div>` : ""}
          </div>
        </article>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(manifest.agentName)} · Sylla workspace</title>
<style>
  :root { color-scheme: dark; --ink:#ebe9df; --muted:#85877e; --line:#2b302a; --lime:#d9f99d; }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; background:#101310; color:var(--ink); font-family:ui-sans-serif,system-ui,sans-serif; }
  body:before { content:""; position:fixed; inset:0; pointer-events:none; opacity:.28; background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px); background-size:28px 28px; }
  main { position:relative; max-width:1100px; margin:auto; padding:54px 58px 80px; }
  .eyebrow { color:var(--lime); font-size:11px; letter-spacing:.22em; text-transform:uppercase; }
  header { display:grid; grid-template-columns:1fr auto; gap:40px; align-items:end; padding-bottom:34px; border-bottom:1px solid var(--line); }
  h1 { margin:12px 0 0; font-family:Georgia,serif; font-size:55px; line-height:.98; font-style:italic; font-weight:400; letter-spacing:-.04em; }
  .stats { display:flex; gap:24px; color:var(--muted); font-size:12px; }
  .stats b { display:block; margin-bottom:4px; color:var(--ink); font:500 20px Georgia,serif; }
  .task { margin:30px 0 24px; padding:18px 20px; border-left:2px solid var(--lime); background:#151915; color:#b7b9ae; font-size:14px; line-height:1.6; }
  .memory { display:grid; grid-template-columns:44px 1fr; gap:16px; padding:24px 4px; border-bottom:1px solid var(--line); }
  .memory-index { color:#4f544d; font:italic 16px Georgia,serif; }
  .meta,.source { color:var(--muted); font-size:10px; letter-spacing:.13em; text-transform:uppercase; }
  h2 { max-width:850px; margin:8px 0 0; font:400 23px/1.25 Georgia,serif; }
  p { max-width:760px; margin:12px 0 0; color:#92968b; font-size:13px; line-height:1.6; }
  .source { margin-top:14px; letter-spacing:.06em; text-transform:none; }
</style>
</head>
<body><main>
  <header><div><div class="eyebrow">${escapeHtml(manifest.agentName)} · private workbench</div><h1>What I understand,<br />with the evidence beside it.</h1></div><div class="stats"><span><b>${manifest.memoryCount}</b>memories</span><span><b>${manifest.artifactCount}</b>sources</span></div></header>
  <div class="task">${escapeHtml(manifest.currentTask)}</div>
  <section>${memories}</section>
</main></body></html>`;
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
        product: "sylla",
        participantRef: manifest.participantRef,
      },
    });

    try {
      await desktop.connect();
      await waitForDesktopReady(desktop);

      const workspacePath = "/home/oai/share/sylla";
      await desktop.exec("mkdir", { args: ["-p", workspacePath] });
      await desktop.fs.write(
        `${workspacePath}/workspace.json`,
        JSON.stringify(manifest, null, 2),
      );
      await desktop.fs.write(
        `${workspacePath}/workspace.html`,
        workspaceDocument(manifest),
      );
      await desktop.open("chrome", [
        "--no-first-run",
        "--disable-default-apps",
        "--app=file:///home/oai/share/sylla/workspace.html",
      ]);

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
        product: "sylla",
        direction: request.direction,
      },
    });

    try {
      await sandbox.connect();
      await sandbox.files.write(
        "/tmp/sylla-input.json",
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
