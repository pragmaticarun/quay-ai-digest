import { getDb } from "@/lib/db";
import { editorErrorResponse, guardEditor, readJsonObject } from "@/lib/editor-http";
import { getEntry, ingestCandidate, listEntries } from "@/lib/entries";
import { EditorError } from "@/lib/errors";
import { manualCandidate } from "@/lib/manual";
import { normalizeCanonicalUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await guardEditor(request);
  if (denied) return denied;
  const entries = listEntries(getDb());
  return Response.json({ entries }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const bodyToken = typeof body.token === "string" ? body.token : null;
    const denied = await guardEditor(request, bodyToken);
    if (denied) return denied;
    const candidate = manualCandidate(body);
    const db = getDb();
    const canonical = normalizeCanonicalUrl(candidate.canonicalUrl);
    const existing = listEntries(db).find((entry) => entry.stableId === candidate.stableId || entry.canonicalUrl === canonical);
    if (existing) {
      throw new EditorError("duplicate", `A record already uses that URL (${existing.id}). Open it instead of creating another.`, 409);
    }
    const effect = ingestCandidate(db, candidate, new Date().toISOString());
    const entry = getEntry(db, effect.id);
    return Response.json({ entry }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return editorErrorResponse(error);
  }
}
