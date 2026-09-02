import { registerFirstPartyOAuthClient } from "@/lib/mcp/first-party-oauth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const client = await registerFirstPartyOAuthClient(await request.json());
    return Response.json(client, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        error: "invalid_client_metadata",
        error_description:
          error instanceof Error ? error.message : "Client registration failed.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
