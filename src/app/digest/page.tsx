import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/db";
import { listPublic } from "@/lib/entries";
import { renderDigest } from "@/lib/export-doc";
import { TYPE_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";

export const metadata = { title: "Digest" };

function idsFrom(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return raw.flatMap((item) => item.split(",")).map((item) => item.trim()).filter(Boolean).slice(0, 50);
}

export default async function DigestPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const params = await searchParams;
  const selected = idsFrom(params.id);
  const entries = listPublic(getDb());
  const preview = renderDigest(
    entries,
    selected.filter((id) => entries.some((entry) => entry.id === id)),
    "Preview uses the current published text. The downloaded file stamps the generation time.",
  );

  return (
    <>
      <SiteHeader current="/digest" />
      <main id="content">
        <h1 className="text-2xl font-medium">Digest</h1>
        <p className="mt-2 max-w-3xl">
          Choose published records, preview the editorial text, then download Markdown or HTML. Rejected and draft records are not listed. Quay does not email this file.
        </p>
        {entries.length === 0 ? (
          <p className="mt-6">Publish reviewed records before building a digest.</p>
        ) : (
          <form className="mt-6 grid gap-3" method="get" action="/digest">
            <fieldset className="grid gap-3">
              <legend className="font-medium">Published records</legend>
              {entries.map((entry) => (
                <label key={entry.id} className="flex items-start gap-3 border-t border-border py-3">
                  <input
                    className="mt-1 size-5"
                    type="checkbox"
                    name="id"
                    value={entry.id}
                    defaultChecked={selected.includes(entry.id)}
                  />
                  <span>
                    <span className="font-medium">{entry.title}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {TYPE_LABEL[entry.type]} · {entry.stableId}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <Button type="submit" className="h-11 w-fit">
              Preview selection
            </Button>
          </form>
        )}
        {selected.length ? (
          <section className="mt-8" aria-label="Digest preview">
            <h2 className="text-xl font-medium">Preview</h2>
            <p className="mt-2 text-sm">
              Included {preview.included.length}. Omitted {preview.omitted.length}. Downloads are generated again from published rows only.
            </p>
            {preview.omitted.length ? (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {preview.omitted.map((item) => (
                  <li key={item.id}>
                    {item.id}: {item.reason}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-primary-foreground"
                href={`/api/export?format=md&ids=${encodeURIComponent(preview.included.map((entry) => entry.id).join(","))}`}
              >
                Download Markdown
              </a>
              <a
                className="inline-flex h-11 items-center rounded-lg border border-border bg-card px-4"
                href={`/api/export?format=html&ids=${encodeURIComponent(preview.included.map((entry) => entry.id).join(","))}`}
              >
                Download HTML
              </a>
            </div>
            <article className="prose-block mt-6 border-t border-border pt-4">
              {preview.included.map((entry) => (
                <section key={entry.id} className="mb-8">
                  <h3 className="text-lg font-medium">{entry.title}</h3>
                  <h4 className="mt-3 font-medium">Facts</h4>
                  <p>{entry.factSummary}</p>
                  <h4 className="mt-3 font-medium">Interpretation</h4>
                  <p>{entry.interpretation.trim() || "None recorded."}</p>
                  <h4 className="mt-3 font-medium">Citations</h4>
                  <ul className="list-disc pl-5">
                    {entry.citations.map((citation) => (
                      <li key={citation.url}>
                        {citation.label} ({citation.role}) — {citation.url}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {preview.included.length === 0 ? <p>No published records were included.</p> : null}
            </article>
          </section>
        ) : null}
      </main>
    </>
  );
}
