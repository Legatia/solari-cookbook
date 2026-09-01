import {
  getProtectedResourceMetadata,
  getSyllaOAuthConfiguration,
} from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

export function GET() {
  const configuration = getSyllaOAuthConfiguration();

  if (!configuration) {
    return Response.json(
      { error: "Sylla OAuth is not configured." },
      { status: 503 },
    );
  }

  return Response.json(getProtectedResourceMetadata(configuration), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}
