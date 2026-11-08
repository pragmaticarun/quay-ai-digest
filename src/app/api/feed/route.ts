import { getDb } from "@/lib/db";
import { listPublic } from "@/lib/entries";
import { toPublicEntry } from "@/lib/public-dto";
import type { PublicQuery } from "@/lib/types";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const url = new URL(request.url);
  const query: PublicQuery = {
    q: url.searchParams.get("q") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    topic: url.searchParams.get("topic") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  };
  const entries = listPublic(getDb(), query).map((entry) => toPublicEntry(entry, false));
  return Response.json({ entries, count: entries.length });
}
