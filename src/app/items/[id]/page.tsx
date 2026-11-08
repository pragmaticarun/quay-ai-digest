import Link from "next/link";
import { notFound } from "next/navigation";
import { BookmarkButton } from "@/components/bookmarks";
import { SafeLink } from "@/components/safe-link";
import { SiteHeader } from "@/components/site-header";
import { TimeValue } from "@/components/time-value";
import { Badge } from "@/components/ui/badge";
import { getDb } from "@/lib/db";
import { getPublic, listEntries } from "@/lib/entries";
import { TYPE_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = getPublic(getDb(), id);
  return { title: entry?.title ?? "Not in the log" };
}

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const entry = getPublic(db, id);
  if (!entry) notFound();
  const related = listEntries(db).filter(
    (item) => entry.relatedIds.includes(item.id) && item.status === "published" && item.origin !== "fixture",
  );

  return (
    <>
      <SiteHeader current="/" />
      <main id="content">
        <p>
          <Link href="/">Back to the log</Link>
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge>{TYPE_LABEL[entry.type]}</Badge>
          <Badge variant="outline">Published</Badge>
          {entry.topics.map((topic) => (
            <Badge key={topic} variant="secondary">
              {topic}
            </Badge>
          ))}
        </div>
        <h1 className="mt-3 max-w-3xl text-3xl font-medium leading-tight">{entry.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {entry.publisher ?? "Publisher unknown"}
          {entry.authors.length ? ` · ${entry.authors.join("; ")}` : ""}
        </p>
        <div className="mt-4">
          <BookmarkButton id={entry.id} />
        </div>
        {entry.sourceDrift ? (
          <p className="mt-4 border border-destructive/40 bg-card p-3 text-sm">
            The source response changed after this text was reviewed. The paragraphs below were not automatically rewritten.
          </p>
        ) : null}
        <div className="detail-grid mt-8">
          <div className="prose-block">
            <h2 className="text-lg font-medium">Facts</h2>
            <p className="mt-2">These sentences are the desk&apos;s factual summary. They are not a copy of the source text.</p>
            <p className="mt-3">{entry.factSummary}</p>
            <h2 className="mt-8 text-lg font-medium">Engineering relevance</h2>
            <p className="mt-3">{entry.engineeringRelevance.trim() || "None recorded."}</p>
            <h2 className="mt-8 text-lg font-medium">Caveats</h2>
            <p className="mt-3">{entry.caveats.trim() || "None recorded."}</p>
            <h2 className="mt-8 text-lg font-medium">Dates</h2>
            <dl className="mt-3 grid gap-2 text-sm">
              <div>
                <dt className="font-medium">Publication date</dt>
                <dd>
                  <TimeValue iso={entry.publishedAt} precision={entry.datePrecision} />
                </dd>
              </div>
              <div>
                <dt className="font-medium">Source updated</dt>
                <dd>{entry.updatedAt ? <TimeValue iso={entry.updatedAt} /> : "Date unknown"}</dd>
              </div>
              <div>
                <dt className="font-medium">Fetched</dt>
                <dd>
                  <TimeValue iso={entry.fetchedAt} />
                </dd>
              </div>
              <div>
                <dt className="font-medium">Reviewed</dt>
                <dd>{entry.reviewedAt ? <TimeValue iso={entry.reviewedAt} /> : "Date unknown"}</dd>
              </div>
            </dl>
            <h2 className="mt-8 text-lg font-medium">Citations</h2>
            <ul className="mt-3 list-disc pl-5">
              {entry.citations.map((citation) => (
                <li key={`${citation.role}-${citation.url}`}>
                  <SafeLink href={citation.url}>{citation.label}</SafeLink> ({citation.role})
                </li>
              ))}
            </ul>
            {related.length ? (
              <>
                <h2 className="mt-8 text-lg font-medium">Related published records</h2>
                <ul className="mt-3 list-disc pl-5">
                  {related.map((item) => (
                    <li key={item.id}>
                      <Link href={`/items/${item.id}`}>{item.title}</Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
          <aside className="margin-note prose-block" aria-label="Interpretation">
            <h2 className="text-lg font-medium">Interpretation</h2>
            <p className="mt-2 text-sm">This is the desk&apos;s reading, not a claim copied from the source.</p>
            <p className="mt-3">{entry.interpretation.trim() || "No interpretation recorded."}</p>
            <h2 className="mt-8 text-lg font-medium">Provenance</h2>
            <dl className="mt-3 grid gap-2 text-sm">
              <div>
                <dt className="font-medium">Adapter</dt>
                <dd>{entry.adapterId}</dd>
              </div>
              <div>
                <dt className="font-medium">Stable id</dt>
                <dd className="break-all font-mono text-xs">{entry.stableId}</dd>
              </div>
              <div>
                <dt className="font-medium">Canonical URL</dt>
                <dd className="break-all">
                  <SafeLink href={entry.canonicalUrl}>{entry.canonicalUrl}</SafeLink>
                </dd>
              </div>
              <div>
                <dt className="font-medium">License note</dt>
                <dd>{entry.licenseNote}</dd>
              </div>
            </dl>
          </aside>
        </div>
        {entry.sourceExcerpt ? (
          <details className="mt-8 border-t border-border pt-4">
            <summary className="cursor-pointer text-base font-medium">Source metadata text</summary>
            <p className="mt-2 text-sm">
              {entry.excerptLicense ?? "Untrusted source text."} Rendered as plain text. This is not the editorial summary.
            </p>
            {entry.sourceLabel ? <p className="mt-3 text-sm">Source label: {entry.sourceLabel}</p> : null}
            <p className="mt-3 whitespace-pre-wrap">{entry.sourceExcerpt}</p>
          </details>
        ) : entry.sourceLabel ? (
          <p className="mt-8 text-sm">
            Source label, stored as untrusted text: {entry.sourceLabel}
          </p>
        ) : null}
      </main>
    </>
  );
}
