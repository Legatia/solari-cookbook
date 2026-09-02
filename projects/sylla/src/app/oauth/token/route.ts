import {
  exchangeFirstPartyAuthorizationCode,
  firstPartyOAuthConfiguration,
  refreshFirstPartyAccessToken,
} from "@/lib/mcp/first-party-oauth";

export const dynamic = "force-dynamic";

function tokenError(description: string) {
  return Response.json(
    { error: "invalid_grant", error_description: description },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const grantType = String(form.get("grant_type") ?? "");
    const clientId = String(form.get("client_id") ?? "");
    const resource = String(
      form.get("resource") ?? firstPartyOAuthConfiguration().resource,
    );
    const token =
      grantType === "authorization_code"
        ? await exchangeFirstPartyAuthorizationCode({
            code: String(form.get("code") ?? ""),
            clientId,
            redirectUri: String(form.get("redirect_uri") ?? ""),
            codeVerifier: String(form.get("code_verifier") ?? ""),
            resource,
          })
        : grantType === "refresh_token"
          ? await refreshFirstPartyAccessToken({
              refreshToken: String(form.get("refresh_token") ?? ""),
              clientId,
              resource,
            })
          : null;
    if (!token) return tokenError("Sylla supports authorization_code and refresh_token grants.");
    return Response.json(token, {
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    });
  } catch (error) {
    return tokenError(
      error instanceof Error ? error.message : "Token exchange failed.",
    );
  }
}
