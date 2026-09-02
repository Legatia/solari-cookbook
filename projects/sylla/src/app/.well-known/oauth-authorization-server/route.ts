import { firstPartyOAuthConfiguration } from "@/lib/mcp/first-party-oauth";

export const dynamic = "force-dynamic";

export function GET() {
  const configuration = firstPartyOAuthConfiguration();
  return Response.json(
    {
      issuer: configuration.issuer,
      authorization_endpoint: configuration.authorizationEndpoint,
      token_endpoint: configuration.tokenEndpoint,
      registration_endpoint: configuration.registrationEndpoint,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["sylla:agent"],
      authorization_response_iss_parameter_supported: true,
      resource_parameter_supported: true,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
