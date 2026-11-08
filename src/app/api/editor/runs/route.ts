import { getDb } from "@/lib/db";
import { guardEditor } from "@/lib/editor-http";
import { listRuns } from "@/lib/entries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await guardEditor(request);
  if (denied) return denied;
  return Response.json({ runs: listRuns(getDb(), 20) }, { headers: { "cache-control": "no-store" } });
}
