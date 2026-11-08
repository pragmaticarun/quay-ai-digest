import { getDb } from "@/lib/db";
import { editorErrorResponse, guardEditor, readJsonObject } from "@/lib/editor-http";
import { getEntry, listEvents, saveEditorial, transitionEntry, type EditorialPatch, type TransitionAction } from "@/lib/entries";
import { EditorError } from "@/lib/errors";
import type { Citation, EntryType } from "@/lib/types";
import { ENTRY_TYPES } from "@/lib/types";

export const dynamic = "force-dynamic";

const ACTIONS: TransitionAction[] = ["publish", "reject", "start_review", "return_to_draft", "apply_pending_source"];

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await guardEditor(request);
  if (denied) return denied;
  const { id } = await context.params;
  const entry = getEntry(getDb(), id);
  if (!entry) return Response.json({ error: "No record with that id." }, { status: 404 });
  return Response.json({ entry, events: listEvents(getDb(), id) }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await readJsonObject(request);
    const denied = await guardEditor(request, typeof body.token === "string" ? body.token : null);
    if (denied) return denied;
    const { id } = await context.params;
    const patch: EditorialPatch = {};
    if (typeof body.title === "string") patch.title = body.title;
    if (typeof body.type === "string") {
      if (!ENTRY_TYPES.includes(body.type as EntryType)) throw new EditorError("type", "Unknown type.");
      patch.type = body.type as EntryType;
    }
    if (Array.isArray(body.topics)) patch.topics = body.topics.filter((topic): topic is string => typeof topic === "string");
    if (typeof body.publisher === "string" || body.publisher === null) patch.publisher = body.publisher as string | null;
    if (Array.isArray(body.authors)) patch.authors = body.authors.filter((author): author is string => typeof author === "string");
    if (typeof body.publishedAt === "string" || body.publishedAt === null) patch.publishedAt = body.publishedAt as string | null;
    if (typeof body.factSummary === "string") patch.factSummary = body.factSummary;
    if (typeof body.interpretation === "string") patch.interpretation = body.interpretation;
    if (typeof body.engineeringRelevance === "string") patch.engineeringRelevance = body.engineeringRelevance;
    if (typeof body.caveats === "string") patch.caveats = body.caveats;
    if (typeof body.reviewNote === "string") patch.reviewNote = body.reviewNote;
    if (Array.isArray(body.citations)) patch.citations = body.citations as Citation[];
    const entry = saveEditorial(getDb(), id, patch, new Date().toISOString());
    return Response.json({ entry, events: listEvents(getDb(), id) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return editorErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await readJsonObject(request);
    const denied = await guardEditor(request, typeof body.token === "string" ? body.token : null);
    if (denied) return denied;
    const { id } = await context.params;
    const action = body.action;
    if (typeof action !== "string" || !ACTIONS.includes(action as TransitionAction)) {
      throw new EditorError("action", "Unknown editorial action.");
    }
    const entry = transitionEntry(getDb(), id, action as TransitionAction, {
      note: typeof body.note === "string" ? body.note : "",
      confirmReviewed: body.confirmReviewed === true,
      now: new Date().toISOString(),
    });
    return Response.json({ entry, events: listEvents(getDb(), id) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return editorErrorResponse(error);
  }
}
