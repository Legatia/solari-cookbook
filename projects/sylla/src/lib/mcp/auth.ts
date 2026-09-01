import {
  requireBearerAuth,
  type AuthInfo,
} from "@modelcontextprotocol/server";

import {
  authenticateDevelopmentMcpRequest,
  tryAuthenticateDevelopmentMcpRequest,
} from "./dev-auth";
import {
  createSyllaOAuthTokenVerifier,
  getSyllaOAuthConfiguration,
  SYLLA_AGENT_SCOPE,
} from "./oauth";

let cachedOauthGate:
  | ((request: Request) => Promise<AuthInfo | Response>)
  | undefined;
let cachedConfigurationKey: string | undefined;

export async function authenticateMcpRequest(request: Request) {
  const developmentAuth = tryAuthenticateDevelopmentMcpRequest(request);
  if (developmentAuth) return developmentAuth;

  const configuration = getSyllaOAuthConfiguration();
  if (!configuration) {
    return authenticateDevelopmentMcpRequest(request);
  }

  const configurationKey = JSON.stringify(configuration);
  if (!cachedOauthGate || cachedConfigurationKey !== configurationKey) {
    cachedOauthGate = requireBearerAuth({
      verifier: createSyllaOAuthTokenVerifier(configuration),
      requiredScopes: [SYLLA_AGENT_SCOPE],
      resourceMetadataUrl: configuration.resourceMetadataUrl,
    });
    cachedConfigurationKey = configurationKey;
  }

  return cachedOauthGate(request);
}
