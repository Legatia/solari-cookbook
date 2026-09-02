import {
  getProtectedResourceMetadata,
  getSyllaOAuthConfiguration,
} from "@/lib/mcp/oauth";
import { firstPartyOAuthConfiguration } from "@/lib/mcp/first-party-oauth";

export const dynamic = "force-dynamic";

export function GET() {
  const configuration = getSyllaOAuthConfiguration();
  const metadata = configuration
    ? getProtectedResourceMetadata(configuration)
    : (() => {
        const firstParty = firstPartyOAuthConfiguration();
        return {
          resource: firstParty.resource,
          authorization_servers: [firstParty.issuer],
          scopes_supported: ["sylla:agent"],
          bearer_methods_supported: ["header"],
          resource_name: "Sylla personal agent",
          resource_documentation: `${firstParty.issuer}/#mcp`,
        };
      })();

  return Response.json(metadata, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}
