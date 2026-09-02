import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  createFirstPartyAuthorizationCode,
  firstPartyOAuthConfiguration,
  validateFirstPartyAuthorizationRequest,
} from "@/lib/mcp/first-party-oauth";
import {
  attachSessionCookie,
  loadSessionState,
  resolveParticipant,
} from "@/lib/sylla/session";

export const dynamic = "force-dynamic";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function errorPage(message: string, status = 400) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sylla connection error</title></head><body style="margin:0;background:#0b0e0b;color:#ece8de;font-family:ui-sans-serif,system-ui;display:grid;min-height:100vh;place-items:center"><main style="width:min(520px,calc(100% - 40px));text-align:center"><div style="margin:auto;width:12px;height:12px;border-radius:999px;background:#dff8a7;box-shadow:0 0 30px #dff8a766"></div><h1 style="font-family:Georgia,serif;font-style:italic;font-weight:400;font-size:42px;margin:28px 0 12px">The connection paused.</h1><p style="color:#8b8b83;line-height:1.7">${escapeHtml(message)}</p><a href="/app" style="display:inline-block;margin-top:24px;color:#dff8a7">Return to Sylla</a></main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

function hidden(name: string, value: string | null) {
  return value === null
    ? ""
    : `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`;
}

export async function GET(request: NextRequest) {
  try {
    const authorization = await validateFirstPartyAuthorizationRequest(
      new URL(request.url),
    );
    const { participant, newToken } = await resolveParticipant(request);
    const state = await loadSessionState(participant.id);
    const redirectHost = new URL(authorization.redirectUri).host;
    const fields = [
      hidden("client_id", authorization.clientId),
      hidden("redirect_uri", authorization.redirectUri),
      hidden("response_type", authorization.responseType),
      hidden("state", authorization.state),
      hidden("code_challenge", authorization.codeChallenge),
      hidden("code_challenge_method", authorization.codeChallengeMethod),
      hidden("resource", authorization.resource),
      hidden("scope", authorization.scopes.join(" ")),
    ].join("");
    const response = new NextResponse(
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect ${escapeHtml(state.agentName ?? "your agent")} · Sylla</title></head><body style="margin:0;background:#0b0e0b;color:#ece8de;font-family:ui-sans-serif,system-ui;min-height:100vh;display:grid;place-items:center"><main style="width:min(620px,calc(100% - 40px));padding:48px 0"><div style="display:flex;align-items:center;gap:12px;color:#dff8a7;font-size:11px;letter-spacing:.18em;text-transform:uppercase"><span style="width:28px;height:1px;background:#dff8a777"></span>Sylla authorization</div><h1 style="font-family:Georgia,serif;font-style:italic;font-weight:400;font-size:clamp(46px,9vw,76px);line-height:.95;letter-spacing:-.045em;margin:28px 0 22px">Let ${escapeHtml(authorization.clientName)} talk with ${escapeHtml(state.agentName ?? "your agent")}?</h1><p style="color:#98988f;line-height:1.8;font-size:15px">This gives the connected AI access to your approved Sylla context and permission to call Sylla tools when you ask. If your agent is new, you can complete its entire setup inside the conversation. The host may retain what you say under its own terms.</p><section style="margin:30px 0;border:1px solid #ffffff17;border-radius:20px;background:#ffffff08;padding:22px"><p style="margin:0 0 14px;color:#65665f;font-size:10px;letter-spacing:.16em;text-transform:uppercase">This connection can</p><div style="display:grid;gap:10px;color:#c7c7be;font-size:13px"><span>✓ Create and configure your personal agent in chat</span><span>✓ Recall context you approved</span><span>✓ Propose and review memories with you</span><span>✓ Use research and private-introduction tools when you direct it</span><span>✓ Return to the same portable agent in another compatible host</span></div></section><p style="color:#5f6059;font-size:11px">Return address: ${escapeHtml(redirectHost)} · Scope: ${escapeHtml(authorization.scopes.join(" "))}</p><form method="post" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:28px">${fields}<button name="decision" value="allow" style="cursor:pointer;border:0;border-radius:999px;background:#dff8a7;color:#101510;padding:14px 22px;font-weight:650">Connect my agent</button><button name="decision" value="deny" style="cursor:pointer;border:1px solid #ffffff20;border-radius:999px;background:transparent;color:#99998f;padding:14px 22px">Not now</button></form></main></body></html>`,
      {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          "X-Frame-Options": "DENY",
        },
      },
    );
    return attachSessionCookie(response, newToken);
  } catch (error) {
    return errorPage(
      error instanceof Error ? error.message : "The OAuth request is invalid.",
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const query = new URLSearchParams();
    for (const name of [
      "client_id",
      "redirect_uri",
      "response_type",
      "state",
      "code_challenge",
      "code_challenge_method",
      "resource",
      "scope",
    ]) {
      const value = form.get(name);
      if (typeof value === "string" && value) query.set(name, value);
    }
    const authorization = await validateFirstPartyAuthorizationRequest(
      new URL(`/oauth/authorize?${query}`, firstPartyOAuthConfiguration().issuer),
    );
    const redirect = new URL(authorization.redirectUri);
    if (form.get("decision") !== "allow") {
      redirect.searchParams.set("error", "access_denied");
      redirect.searchParams.set("error_description", "The Sylla connection was not approved.");
    } else {
      const { participant, newToken } = await resolveParticipant(request);
      const code = await createFirstPartyAuthorizationCode(
        participant.id,
        authorization,
      );
      redirect.searchParams.set("code", code);
      redirect.searchParams.set("iss", firstPartyOAuthConfiguration().issuer);
      if (authorization.state) redirect.searchParams.set("state", authorization.state);
      return attachSessionCookie(NextResponse.redirect(redirect, 303), newToken);
    }
    redirect.searchParams.set("iss", firstPartyOAuthConfiguration().issuer);
    if (authorization.state) redirect.searchParams.set("state", authorization.state);
    return NextResponse.redirect(redirect, 303);
  } catch (error) {
    return errorPage(
      error instanceof Error ? error.message : "The authorization failed.",
    );
  }
}
