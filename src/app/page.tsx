import Link from "next/link";
import { BookmarkButton, BookmarkRow, SavedEmpty, SavedToggle } from "@/components/bookmarks";
import { SafeLink } from "@/components/safe-link";
import { SiteHeader } from "@/components/site-header";
import { TimeValue } from "@/components/time-value";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDb } from "@/lib/db";
import { countPublishedByType, listEntries, listPublic, publishedTopics } from "@/lib/entries";
import { TYPE_LABEL } from "@/lib/labels";
import type { EntryType, PublicQuery } from "@/lib/types";
import { ENTRY_TYPES } from "@/lib/types";

export const dynamic = "force-dynamic";

type Search = {
  q?: string;
  type?: string;
  topic?: string;
  from?: string;
  to?: string;
};

export default async function HomePage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const query: PublicQuery = {
    q: params.q || undefined,
    type: params.type || undefined,
    topic: params.topic || undefined,
    from: params.from || undefined,
    to: params.to || undefined,
  };
  const db = getDb();
  const all = listEntries(db);
  const counts = countPublishedByType(all);
  const topics = publishedTopics(all);
  const entries = listPublic(db, query);
  const dateFilter = Boolean(query.from || query.to);

  return (
    <>
      <SiteHeader current="/" />
      <main id="content">
        <h1 className="text-2xl font-medium">Public log</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          {counts.all} published record{counts.all === 1 ? "" : "s"}. Drafts, rejected records, and fixtures stay out of this list. Counts are computed from the local database.
        </p>
        <form className="filter-grid mt-6" method="get" action="/">
          <div className="grid gap-1">
            <Label htmlFor="q">Search</Label>
            <Input id="q" name="q" defaultValue={params.q ?? ""} placeholder="Title, fact, topic, id" className="h-11" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="type">Type</Label>
            <select id="type" name="type" defaultValue={params.type ?? ""} className="h-11 rounded-lg border border-input bg-card px-2">
              <option value="">All types ({counts.all})</option>
              {ENTRY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABEL[type]} ({counts[type]})
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="topic">Topic</Label>
            <select id="topic" name="topic" defaultValue={params.topic ?? ""} className="h-11 rounded-lg border border-input bg-card px-2">
              <option value="">All topics</option>
              {params.topic && !topics.includes(params.topic) ? <option value={params.topic}>{params.topic}</option> : null}
              {topics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="from">Published from</Label>
            <Input id="from" name="from" type="date" defaultValue={params.from ?? ""} className="h-11" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="to">Published through</Label>
            <Input id="to" name="to" type="date" defaultValue={params.to ?? ""} className="h-11" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="h-11">
              Apply
            </Button>
            <Link className="inline-flex h-11 items-center rounded-lg border border-border bg-card px-4" href="/">
              Clear
            </Link>
          </div>
        </form>
        <p className="mt-2 text-sm text-muted-foreground">Date filters use the UTC calendar day stored for each record.</p>
        {dateFilter ? (
          <p className="text-sm">Records with an unknown publication date are hidden while a date range is set.</p>
        ) : null}
        <div className="mt-4">
          <SavedToggle />
        </div>
        <p className="mt-4" aria-live="polite">
          Showing {entries.length} published record{entries.length === 1 ? "" : "s"}
          {query.q || query.type || query.topic || dateFilter ? " matching these filters" : ""}.
        </p>
        {counts.all === 0 ? (
          <div className="mt-8 max-w-2xl">
            <h2 className="text-xl font-medium">Nothing has been published.</h2>
            <p className="mt-2">
              The public log starts empty. A local editor can fetch permitted sources or add a citation by hand, then publish only after review. Open the{" "}
              <Link href="/editor">editor</Link> on this machine.
            </p>
          </div>
        ) : null}
        {counts.all > 0 && entries.length === 0 ? <p className="mt-6">No published records match these filters.</p> : null}
        <SavedEmpty ids={entries.map((entry) => entry.id)} />
        <ul className="ledger mt-2">
          {entries.map((entry) => (
            <BookmarkRow key={entry.id} id={entry.id}>
              <div className="entry-meta">
                <div>{TYPE_LABEL[entry.type as EntryType]}</div>
                <TimeValue iso={entry.publishedAt} precision={entry.datePrecision} stacked />
              </div>
              <article>
                <div className="mb-2 flex flex-wrap gap-2">
                  {entry.topics.map((topic) => (
                    <Badge key={topic} variant="outline">
                      {topic}
                    </Badge>
                  ))}
                  {entry.sourceDrift ? <Badge variant="destructive">Source changed after review</Badge> : null}
                </div>
                <h2 className="text-xl font-medium leading-snug">
                  <Link href={`/items/${entry.id}`}>{entry.title}</Link>
                </h2>
                <p className="mt-2 line-clamp-4 whitespace-pre-wrap">{entry.factSummary}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {entry.publisher ?? "Publisher unknown"} · <SafeLink href={entry.canonicalUrl}>Primary URL</SafeLink>
                </p>
                <div className="mt-3">
                  <BookmarkButton id={entry.id} />
                </div>
              </article>
            </BookmarkRow>
          ))}
        </ul>
      </main>
    </>
  );
}
