import { adapters } from "@/lib/adapters/registry";
import { TYPE_LABEL } from "@/lib/labels";
import { jsonForHtml, text, type PagesRecord } from "@/lib/pages-public";
import type { EntryType } from "@/lib/types";

function href(base: string, path: string): string {
  if (!path.startsWith("/")) return `${base}/${path}`;
  return `${base}${path}`;
}

function page(base: string, title: string, current: string, body: string, data: unknown): string {
  const links = [
    ["/", "Log"],
    ["/digest/", "Digest"],
    ["/sources/", "Sources"],
    ["/about/", "About"],
  ];
  const nav = links
    .map(([path, label]) => `<a href="${href(base, path)}"${path === current ? ' aria-current="page"' : ""}>${label}</a>`)
    .join("");
  return `<!DOCTYPE html>
<html lang="en" data-base="${text(base)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${text(title)}</title>
  <link rel="stylesheet" href="${href(base, "/assets/desk.css")}">
</head>
<body>
  <div class="shell">
    <a class="skip" href="#content">Skip to content</a>
    <p class="kicker">Reviewed snapshot</p>
    <a class="wordmark" href="${href(base, "/")}">Quay</a>
    <p class="deck">A static reading copy of records a person published on their local desk. Drafts, the database, and the editor are not on this site.</p>
    <nav aria-label="Primary">${nav}</nav>
    <main id="content">${body}</main>
  </div>
  <script type="application/json" id="quay-data">${jsonForHtml(data)}</script>
  <script src="${href(base, "/assets/desk.js")}"></script>
</body>
</html>`;
}

function recordCard(base: string, record: PagesRecord): string {
  const search = [record.title, record.factSummary, record.stableId, record.topics.join(" ")].join(" ");
  const topics = record.topics.map((topic) => `<span class="topic">${text(topic)}</span>`).join(" ");
  const when = record.publishedAt ?? "Date unknown";
  return `<article class="entry" data-record data-type="${text(record.type)}" data-topics="${text(record.topics.join("|"))}" data-published="${text(record.publishedAt)}" data-search="${text(search)}">
    <div class="meta"><div>${text(TYPE_LABEL[record.type as EntryType])}</div><div>${text(when)}</div></div>
    <div>
      <div>${topics}</div>
      <h2><a href="${href(base, `/items/${record.id}/`)}">${text(record.title)}</a></h2>
      <p>${text(record.factSummary)}</p>
      <p class="muted">${text(record.publisher ?? "Publisher unknown")} · <a href="${text(record.canonicalUrl)}">Primary source</a></p>
      <button type="button" class="secondary" data-bookmark="${text(record.id)}">Save on this browser</button>
    </div>
  </article>`;
}

export function renderIndex(base: string, records: PagesRecord[]): string {
  const types = ["", "news", "model", "paper", "repo", "tool"]
    .map((type) => `<option value="${type}">${type ? TYPE_LABEL[type as EntryType] : "All types"}</option>`)
    .join("");
  const topics = [...new Set(records.flatMap((record) => record.topics))];
  const topicOptions = [`<option value="">All topics</option>`]
    .concat(topics.map((topic) => `<option value="${text(topic)}">${text(topic)}</option>`))
    .join("");
  const list = records.length ? records.map((record) => recordCard(base, record)).join("") : `<h2>Nothing has been published.</h2><p>This snapshot has no reviewed records. The local editor can publish some, then a person can replace the snapshot. This page does not invent coverage.</p>`;
  const body = `<h1>Public log</h1>
    <p>${records.length} published record${records.length === 1 ? "" : "s"}. Counts come from this snapshot, not from a live database.</p>
    <form id="filters" class="filters">
      <label>Search<input name="q" placeholder="Title, fact, topic, id"></label>
      <label>Type<select name="type">${types}</select></label>
      <label>Topic<select name="topic">${topicOptions}</select></label>
      <label>Published from<input name="from" type="date"></label>
      <label>Published through<input name="to" type="date"></label>
      <button type="submit">Apply</button>
    </form>
    <p class="muted">Date filters use the UTC calendar day stored on each record. Filters run in this browser.</p>
    <p>Bookmarks stay in this browser's local storage. This site has no account. <span id="saved-count">0</span> saved here.</p>
    <p id="filter-status">Showing ${records.length} published record${records.length === 1 ? "" : "s"}.</p>
    ${list}`;
  return page(base, "Quay", "/", body, { records });
}

export function renderDetail(base: string, record: PagesRecord, records: PagesRecord[]): string {
  const citations = record.citations
    .map((citation) => `<li><a href="${text(citation.url)}">${text(citation.label)}</a> (${text(citation.role)})</li>`)
    .join("");
  const body = `<p><a href="${href(base, "/")}">Back to the log</a></p>
    <p class="muted">${text(TYPE_LABEL[record.type])} · ${text(record.stableId)}</p>
    <h1>${text(record.title)}</h1>
    <p>${text(record.authors.join("; ") || "Authors unknown")}</p>
    <button type="button" class="secondary" data-bookmark="${text(record.id)}">Save on this browser</button>
    <div class="detail">
      <div>
        <h2>Facts</h2>
        <p>These sentences are the reviewed summary. They are not a copy of the source text.</p>
        <p>${text(record.factSummary)}</p>
        <h2>Engineering relevance</h2>
        <p>${text(record.engineeringRelevance || "None recorded.")}</p>
        <h2>Caveats</h2>
        <p>${text(record.caveats || "None recorded.")}</p>
        <h2>Dates</h2>
        <dl>
          <dt>Publication date</dt><dd>${text(record.publishedAt ?? "Date unknown")} (${text(record.datePrecision)})</dd>
          <dt>Source updated</dt><dd>${text(record.updatedAt ?? "Date unknown")}</dd>
          <dt>Fetched</dt><dd>${text(record.fetchedAt || "Date unknown")}</dd>
          <dt>Reviewed</dt><dd>${text(record.reviewedAt ?? "Date unknown")}</dd>
        </dl>
        <h2>Citations</h2>
        <ul>${citations}</ul>
      </div>
      <aside class="note">
        <h2>Interpretation</h2>
        <p>${text(record.interpretation || "None recorded.")}</p>
        <h2>Provenance</h2>
        <p>Adapter ${text(record.adapterId)}. ${text(record.licenseNote)}</p>
        <p>Source text and editorial notes are not included in this snapshot.</p>
        ${record.sourceDrift ? "<p>The source changed after review. The local desk has the pending copy.</p>" : ""}
      </aside>
    </div>`;
  return page(base, record.title, "/", body, { records });
}

export function renderDigest(base: string, records: PagesRecord[]): string {
  const choices = records
    .map(
      (record) =>
        `<label><span><input type="checkbox" name="id" value="${text(record.id)}"> ${text(record.title)}</span><span class="muted">${text(TYPE_LABEL[record.type])} · ${text(record.stableId)}</span></label>`,
    )
    .join("");
  const body = `<h1>Digest</h1>
    <p>Choose reviewed records and download Markdown or HTML in this browser. Nothing is emailed.</p>
    <form id="digest-form" class="grid">
      ${choices || "<p>No published records are in this snapshot.</p>"}
      <button type="submit">Preview selection</button>
    </form>
    <h2>Preview</h2>
    <pre id="digest-preview">Nothing selected.</pre>
    <p><a id="download-md" class="button" download="quay-digest.md" href="${href(base, "/")}">Download Markdown</a> <a id="download-html" class="button secondary" download="quay-digest.html" href="${href(base, "/")}">Download HTML</a></p>`;
  return page(base, "Digest · Quay", "/digest/", body, { records });
}

export function renderSources(base: string, records: PagesRecord[]): string {
  const cards = adapters
    .map((adapter) => {
      const docs = adapter.docs.map((doc) => `<li><a href="${text(doc.url)}">${text(doc.label)}</a></li>`).join("");
      return `<section class="card"><h2>${text(adapter.title)} <span class="topic">${adapter.enabled ? "Enabled" : "Disabled"}</span></h2>
        <p>${text(adapter.permissionSummary)}</p>
        ${adapter.disabledReason ? `<p><strong>Why it is off.</strong> ${text(adapter.disabledReason)}</p>` : ""}
        <p><strong>Daily refresh.</strong> ${text(adapter.dailyFeasibility)}</p>
        <p><strong>Request.</strong> ${text(adapter.requestDescription)}</p>
        ${docs ? `<ul>${docs}</ul>` : ""}
      </section>`;
    })
    .join("");
  const body = `<h1>Source allowlist</h1>
    <p>Enabled sources can be fetched on the local desk. They land as drafts. This site only receives records after a person copies a reviewed snapshot. Permission to store each source is the operator's responsibility. Quay does not claim those terms were independently verified.</p>
    ${cards}`;
  return page(base, "Sources · Quay", "/sources/", body, { records });
}

export function renderAbout(base: string, records: PagesRecord[]): string {
  const body = `<h1>About this snapshot</h1>
    <p>Quay's editor, SQLite file, and bearer token stay on the machine that reviews records. GitHub Pages only serves this static copy.</p>
    <p>The public file starts empty. Publishing a record locally does not put it here until someone reviews a candidate snapshot and commits that file.</p>
    <p>Bookmarks use local storage key quay.bookmarks.v1 in this browser. There is no account and no tracking pixel.</p>`;
  return page(base, "About · Quay", "/about/", body, { records });
}

export function renderNotFound(base: string): string {
  return page(base, "Not found · Quay", "/", `<h1>That page is not in the snapshot.</h1><p><a href="${href(base, "/")}">Back to the log</a></p>`, { records: [] });
}
