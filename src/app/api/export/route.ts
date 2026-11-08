import { getDb } from "@/lib/db";
import { listEntries } from "@/lib/entries";
import { renderDigest } from "@/lib/export-doc";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "md";
  if (format !== "md" && format !== "html") {
    return Response.json({ error: "Format must be md or html." }, { status: 400 });
  }
  const ids = url.searchParams
    .getAll("ids")
    .flatMap((value) => value.split(","))
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 50);
  for (const id of ids) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
      return Response.json({ error: "An id contained characters this desk will not accept." }, { status: 400 });
    }
  }
  const generatedAt = new Date().toISOString();
  const digest = renderDigest(listEntries(getDb()), ids, generatedAt);
  const download = url.searchParams.get("download") !== "0";
  const body = format === "html" ? digest.html : digest.markdown;
  const type = format === "html" ? "text/html; charset=utf-8" : "text/markdown; charset=utf-8";
  const filename = format === "html" ? "quay-digest.html" : "quay-digest.md";
  return new Response(body, {
    headers: {
      "content-type": type,
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
