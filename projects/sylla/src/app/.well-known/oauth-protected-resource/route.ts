import { GET as getProtectedResourceMetadata } from "./mcp/route";

export const dynamic = "force-dynamic";

export function GET() {
  return getProtectedResourceMetadata();
}
