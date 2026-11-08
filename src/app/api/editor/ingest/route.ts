import { getDb } from "@/lib/db";
import { editorErrorResponse, guardEditor, readJsonObject } from "@/lib/editor-http";
import { runAdapter } from "@/lib/ingest";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const bodyToken = typeof body.token === "string" ? body.token : null;
    const denied = await guardEditor(request, bodyToken);
    if (denied) return denied;
    const adapterId = typeof body.adapterId === "string" ? body.adapterId : "";
    const force = body.force === true;
    const run = await runAdapter(getDb(), adapterId, { force });
    return Response.json({ run }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return editorErrorResponse(error);
  }
}
