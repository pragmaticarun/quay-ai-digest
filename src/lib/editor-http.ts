import { authorizeEditor, ensureEditorToken } from "@/lib/auth";
import { EditorError } from "@/lib/errors";

export function editorErrorResponse(error: unknown): Response {
  if (error instanceof EditorError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "The editor hit an unexpected error." }, { status: 500 });
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new EditorError("json", "Request body was not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new EditorError("json", "JSON body must be an object.");
  }
  return parsed as Record<string, unknown>;
}

export async function guardEditor(request: Request, bodyToken?: string | null): Promise<Response | null> {
  const auth = authorizeEditor(request, ensureEditorToken(), bodyToken);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  return null;
}
