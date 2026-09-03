import { Solari, SolariError } from "@solarisdk/browser";
import { DesktopClient } from "@solarisdk/desktop";
import { SandboxClient } from "@solarisdk/sandbox";

import {
  directionalEvaluationRequestSchema,
  directionalEvaluationSchema,
  browserComputerRequestSchema,
  browserComputerResultSchema,
  researchRequestSchema,
  researchResultSchema,
  repositoryTaskRequestSchema,
  repositoryTaskResultSchema,
  workspaceManifestSchema,
  workspaceResultSchema,
  type BrowserResearchAdapter,
  type BrowserComputerAdapter,
  type DesktopWorkspaceAdapter,
  type SandboxEvaluationAdapter,
  type SandboxTaskAdapter,
  type WorkspaceManifest,
  type WorkspaceOpenOptions,
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

function allowedBrowserOrigin(url: string, allowedOrigins: Set<string>) {
  const parsed = assertPublicHttpUrl(url);
  if (!allowedOrigins.has(parsed.origin)) {
    throw new Error(
      `The browser moved to ${parsed.origin}, which is outside this mission's approved origins.`,
    );
  }
  return parsed;
}

async function annotateBrowserControls(page: {
  locator(selector: string): {
    evaluateAll<T>(callback: (elements: Element[]) => T): Promise<T>;
  };
}) {
  return page
    .locator(
      "a,button,input,textarea,select,[role='button'],[role='link'],[contenteditable='true']",
    )
    .evaluateAll((elements) =>
      elements
        .filter(
          (element) =>
            element.getClientRects().length > 0 &&
            element.getAttribute("aria-hidden") !== "true" &&
            !(
              element instanceof HTMLInputElement &&
              element.type.toLowerCase() === "hidden"
            ),
        )
        .slice(0, 80)
        .map((element, index) => {
        const ref = `e${index + 1}`;
        element.setAttribute("data-sylla-ref", ref);
        const input = element instanceof HTMLInputElement ? element : null;
        const autocomplete = input?.autocomplete?.toLowerCase() ?? "";
        const inputType = input?.type?.toLowerCase();
        const sensitiveHint = [
          input?.name,
          input?.id,
          input?.placeholder,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const sensitive =
          inputType === "password" ||
          autocomplete.includes("password") ||
          autocomplete === "one-time-code" ||
          autocomplete.startsWith("cc-") ||
          /\b(otp|one.?time|verification.?code|card.?number|cvc|cvv|security.?code)\b/i.test(
            sensitiveHint,
          );
        const role =
          element.getAttribute("role") ||
          (element.tagName === "A"
            ? "link"
            : element.tagName === "BUTTON"
              ? "button"
              : element.tagName.toLowerCase());
        const text =
          element.getAttribute("aria-label") ||
          element.textContent?.replace(/\s+/g, " ").trim() ||
          input?.name ||
          "";
        return {
          ref,
          role,
          text: text.slice(0, 240),
          ...(element instanceof HTMLAnchorElement && element.href
            ? { href: element.href }
            : {}),
          ...(inputType ? { inputType } : {}),
          ...(input?.placeholder ? { placeholder: input.placeholder.slice(0, 160) } : {}),
          disabled:
            (element instanceof HTMLButtonElement ||
              element instanceof HTMLInputElement ||
              element instanceof HTMLSelectElement ||
              element instanceof HTMLTextAreaElement) &&
            element.disabled,
          sensitive,
        };
        }),
    );
}

export class SolariBrowserComputerAdapter implements BrowserComputerAdapter {
  constructor(private readonly options: LiveAdapterOptions) {}

  async deleteProfile(profileId: string) {
    const client = new Solari(this.options);
    try {
      await client.profiles.delete(profileId);
    } finally {
      await client.close();
    }
  }

  async operate(input: unknown) {
    const request = browserComputerRequestSchema.parse(input);
    const allowedOrigins = new Set(
      request.allowedOrigins.map((value) => assertPublicHttpUrl(value).origin),
    );
    const startUrl = allowedBrowserOrigin(request.startUrl, allowedOrigins);
    const client = new Solari(this.options);
    const profile = request.profileId
      ? { id: request.profileId }
      : await client.profiles.create({
          name: `sylla-${request.participantRef.slice(0, 8)}`,
        });
    let browser;
    try {
      browser = await client.launch({
        profileId: profile.id,
        recording: true,
        stealth: true,
        captcha: true,
        retries: 1,
        probe: true,
      });
    } catch (error) {
      if (!(error instanceof SolariError) || error.code !== "FeatureRequiresPlan") {
        throw error;
      }
      browser = await client.launch({
        profileId: profile.id,
        recording: true,
        retries: 1,
        probe: true,
      });
    }
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    let actionsCompleted = 0;
    let humanCheckpoint: { required: boolean; reason: string | null } | null = null;

    try {
      await page.goto(startUrl.toString(), {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });

      for (const action of request.actions) {
        const availableControls = await annotateBrowserControls(page);
        if (availableControls.some((control) => control.sensitive)) {
          humanCheckpoint = {
            required: true,
            reason:
              "This page requires a password, one-time code, or payment credential. Sylla will not send secrets through the host model.",
          };
          break;
        }
        if (action.type === "navigate") {
          const url = allowedBrowserOrigin(action.url, allowedOrigins);
          await page.goto(url.toString(), {
            waitUntil: "domcontentloaded",
            timeout: 30_000,
          });
        } else if (action.type === "back") {
          await page.goBack({ waitUntil: "domcontentloaded", timeout: 30_000 });
        } else if (action.type === "wait") {
          await page.waitForTimeout(action.milliseconds);
        } else {
          await annotateBrowserControls(page);
          const locator = page.locator(`[data-sylla-ref="${action.ref}"]`);
          if ((await locator.count()) !== 1) {
            throw new Error(`Browser control ${action.ref} is no longer available.`);
          }
          if (action.type === "fill") {
            const [inputType, autocomplete, name, id, placeholder] = await Promise.all([
              locator.getAttribute("type"),
              locator.getAttribute("autocomplete"),
              locator.getAttribute("name"),
              locator.getAttribute("id"),
              locator.getAttribute("placeholder"),
            ]);
            const sensitiveHint = [name, id, placeholder]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();
            if (
              inputType?.toLowerCase() === "password" ||
              autocomplete?.toLowerCase().includes("password") ||
              autocomplete?.toLowerCase() === "one-time-code" ||
              autocomplete?.toLowerCase().startsWith("cc-") ||
              /\b(otp|one.?time|verification.?code|card.?number|cvc|cvv|security.?code)\b/i.test(
                sensitiveHint,
              )
            ) {
              humanCheckpoint = {
                required: true,
                reason:
                  "A password, one-time code, or payment credential is required. Sylla will not send secrets through the host model.",
              };
              break;
            }
            await locator.fill(action.value, { timeout: 15_000 });
          } else if (action.type === "click") {
            const href = await locator.getAttribute("href");
            if (href) {
              allowedBrowserOrigin(new URL(href, page.url()).toString(), allowedOrigins);
            }
            await locator.click({ timeout: 15_000 });
          } else if (action.type === "press") {
            await locator.press(action.key, { timeout: 15_000 });
          } else if (action.type === "select") {
            await locator.selectOption(action.value, { timeout: 15_000 });
          } else if (action.type === "check") {
            await locator.check({ timeout: 15_000 });
          }
        }

        actionsCompleted += 1;
        await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => undefined);
        allowedBrowserOrigin(page.url(), allowedOrigins);
      }

      const controls = await annotateBrowserControls(page);
      if (!humanCheckpoint && controls.some((control) => control.sensitive)) {
        humanCheckpoint = {
          required: true,
          reason:
            "This page contains a password, one-time-code, or payment-credential field. The connected host can continue after a secure human-authentication path is available.",
        };
      }
      const [title, bodyText, storageState] = await Promise.all([
        page.title(),
        page.locator("body").innerText({ timeout: 15_000 }).catch(() => ""),
        context.storageState(),
      ]);
      await client.profiles.save(profile.id, storageState);

      return browserComputerResultSchema.parse({
        provider: "solari",
        runReference: browser.id,
        profileId: profile.id,
        page: {
          url: allowedBrowserOrigin(page.url(), allowedOrigins).toString(),
          title,
          text: excerpt(bodyText, 6_000),
          controls,
        },
        humanCheckpoint,
        actionsCompleted,
        profileSaved: true,
      });
    } finally {
      await browser.close().catch(() => undefined);
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

  async createVolume(participantRef: string) {
    const volume = await this.client.volumes.create({
      name: `sylla-${participantRef.slice(0, 8)}`,
      sizeMb: 512,
      metadata: {
        product: "sylla",
        participantRef,
      },
    });

    return volume.volumeId;
  }

  async provision(input: unknown, options: WorkspaceOpenOptions) {
    const manifest = workspaceManifestSchema.parse(input);
    const createDesktop = () =>
      this.client.create({
          template: "default",
          resolution: "1440x900",
          cpu: 2,
          memMb: 3072,
          timeoutMs: 15 * 60 * 1000,
          lifecycle: { onTimeout: "pause", autoResume: true },
          volumes: [
            {
              volumeId: options.volumeId,
              path: "/home/oai/share/sylla-home",
            },
          ],
          metadata: {
            product: "sylla",
            participantRef: manifest.participantRef,
          },
        });
    let createdSession = !options.sessionId;
    let desktop;

    if (options.sessionId) {
      try {
        const existing = await this.client.get(options.sessionId);
        if (existing.status === "gone" || existing.status === "releasing") {
          desktop = await createDesktop();
          createdSession = true;
        } else {
          desktop = await this.client.connect(options.sessionId);
        }
      } catch (error) {
        if ((error as { status?: number }).status !== 404) throw error;
        desktop = await createDesktop();
        createdSession = true;
      }
    } else {
      desktop = await createDesktop();
    }

    try {
      await desktop.connect();
      await waitForDesktopReady(desktop);

      const workspacePath = "/home/oai/share/sylla-home/workbench";
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
        "--app=file:///home/oai/share/sylla-home/workbench/workspace.html",
      ]);
      const snapshotId = await desktop.snapshot("sylla-workbench");

      return workspaceResultSchema.parse({
        provider: "solari",
        sessionId: desktop.sessionId,
        volumeId: options.volumeId,
        snapshotId,
        status: "ready",
        streamCapability: desktop.streamUrl,
      });
    } catch (error) {
      if (createdSession) {
        await this.client.destroy(desktop.sessionId);
      }
      throw error;
    } finally {
      desktop.close();
    }
  }

  async checkpoint(sessionId: string, name = "sylla-checkpoint") {
    const desktop = await this.client.connect(sessionId);
    try {
      await desktop.connect();
      await waitForDesktopReady(desktop);
      return await desktop.snapshot(name);
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

  async deleteVolume(volumeId: string) {
    await this.client.volumes.delete(volumeId);
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

function repositoryUrl(value: string) {
  const url = assertPublicHttpUrl(value);
  if (!["github.com", "gitlab.com", "bitbucket.org"].includes(url.hostname)) {
    throw new Error("Repository missions currently accept public GitHub, GitLab, or Bitbucket URLs.");
  }
  url.hash = "";
  url.search = "";
  return url.toString();
}

const repositoryCheckScript = `
set -u
if [ -f package.json ]; then
  if [ -f pnpm-lock.yaml ]; then
    corepack enable >/dev/null 2>&1 || true
    echo "SYLLA_PROJECT_TYPE=node"
    echo "SYLLA_COMMAND=pnpm install --frozen-lockfile && pnpm test"
    pnpm install --frozen-lockfile && pnpm test
  elif [ -f yarn.lock ]; then
    corepack enable >/dev/null 2>&1 || true
    echo "SYLLA_PROJECT_TYPE=node"
    echo "SYLLA_COMMAND=yarn install --immutable && yarn test"
    yarn install --immutable && yarn test
  else
    echo "SYLLA_PROJECT_TYPE=node"
    echo "SYLLA_COMMAND=npm install && npm test"
    npm install && npm test
  fi
elif [ -f pyproject.toml ] || [ -f requirements.txt ] || [ -f setup.py ]; then
  echo "SYLLA_PROJECT_TYPE=python"
  echo "SYLLA_COMMAND=python -m pytest"
  python -m pip install -q pytest
  [ ! -f requirements.txt ] || python -m pip install -q -r requirements.txt
  python -m pytest
elif [ -f Cargo.toml ]; then
  echo "SYLLA_PROJECT_TYPE=rust"
  echo "SYLLA_COMMAND=cargo test"
  cargo test
elif [ -f go.mod ]; then
  echo "SYLLA_PROJECT_TYPE=go"
  echo "SYLLA_COMMAND=go test ./..."
  go test ./...
else
  echo "SYLLA_PROJECT_TYPE=unknown"
  echo "SYLLA_COMMAND=find . -maxdepth 2 -type f"
  find . -maxdepth 2 -type f | head -200
fi
`;

function marker(output: string, name: string) {
  return output.match(new RegExp(`^${name}=(.+)$`, "m"))?.[1]?.trim();
}

export class SolariSandboxTaskAdapter implements SandboxTaskAdapter {
  private readonly client: SandboxClient;

  constructor(options: LiveAdapterOptions) {
    this.client = new SandboxClient(options);
  }

  async runRepositoryTask(input: unknown) {
    const request = repositoryTaskRequestSchema.parse(input);
    const normalizedUrl = repositoryUrl(request.repositoryUrl);
    const sandbox = await this.client.create({
      template: "base",
      cpu: 1,
      memMb: 2048,
      diskGb: 8,
      timeoutMs: 10 * 60 * 1000,
      lifecycle: { onTimeout: "kill" },
      metadata: {
        product: "sylla",
        task: "repository-check",
        participantRef: request.participantRef,
      },
    });

    try {
      await sandbox.connect();
      await sandbox.git.clone(normalizedUrl, {
        path: "/tmp/sylla-repository",
        depth: 1,
      });
      const checked = await sandbox.commands.run("sh", {
        args: ["-c", repositoryCheckScript],
        cwd: "/tmp/sylla-repository",
        timeoutMs: 4 * 60 * 1000,
      });
      const stdout = checked.stdout.slice(-12_000);
      const stderr = checked.stderr.slice(-8_000);
      const projectType = marker(stdout, "SYLLA_PROJECT_TYPE") ?? "unknown";
      const command = marker(stdout, "SYLLA_COMMAND") ?? "repository inspection";
      return repositoryTaskResultSchema.parse({
        provider: "solari",
        runReference: sandbox.id,
        repositoryUrl: normalizedUrl,
        projectType,
        command,
        exitCode: checked.exitCode,
        stdout,
        stderr,
        summary:
          checked.exitCode === 0
            ? `The isolated ${projectType} repository checks completed successfully.`
            : `The isolated ${projectType} repository checks exited with code ${checked.exitCode}.`,
      });
    } finally {
      await this.client.kill(sandbox.id);
    }
  }
}
