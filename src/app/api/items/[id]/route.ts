import { getDb } from "@/lib/db";
import { getPublic, listEntries } from "@/lib/entries";
import { toPublicEntry } from "@/lib/public-dto";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const entry = getPublic(getDb(), id);
  if (!entry) return Response.json({ error: "Not in the public log." }, { status: 404 });
  const related = listEntries(getDb())
    .filter((item) => entry.relatedIds.includes(item.id) && item.status === "published" && item.origin !== "fixture")
    .map((item) => ({ id: item.id, title: item.title, type: item.type }));
  return Response.json({ entry: toPublicEntry(entry, true), related });
}
