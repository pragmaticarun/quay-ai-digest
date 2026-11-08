import { escapeHtml } from "@/lib/escape";
import { formatUtc } from "@/lib/dates";
import { normalizeCanonicalUrl } from "@/lib/urls";
import type { Citation, Entry } from "@/lib/types";

export type DigestDocument = {
  markdown: string;
  html: string;
  included: Entry[];
  omitted: { id: string; reason: string }[];
};

function citationLine(citation: Citation): { markdown: string; html: string } {
  const safe = normalizeCanonicalUrl(citation.url);
  const label = citation.label.trim() || "Untitled citation";
  if (!safe) {
    return {
      markdown: `- ${label} (${citation.role}; URL omitted because the scheme is not allowed)`,
      html: `<li>${escapeHtml(label)} (${escapeHtml(citation.role)}; URL omitted because the scheme is not allowed)</li>`,
    };
  }
  return {
    markdown: `- [${label.replaceAll("]", "\\]")}](${safe}) (${citation.role})`,
    html: `<li><a href="${escapeHtml(safe)}" rel="noopener noreferrer">${escapeHtml(label)}</a> (${escapeHtml(citation.role)})</li>`,
  };
}

function section(title: string, body: string): { markdown: string; html: string } {
  const text = body.trim() ? body.trim() : "None recorded.";
  return {
    markdown: `### ${title}\n\n${text}\n`,
    html: `<h3>${escapeHtml(title)}</h3><p>${escapeHtml(text).replaceAll("\n", "<br>")}</p>`,
  };
}

export function selectForExport(entries: Entry[], ids: string[]): { included: Entry[]; omitted: { id: string; reason: string }[] } {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const included: Entry[] = [];
  const omitted: { id: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const entry = byId.get(id);
    if (!entry) {
      omitted.push({ id, reason: "No record with this id." });
      continue;
    }
    if (entry.origin === "fixture") {
      omitted.push({ id, reason: "Fixture records are excluded from digests." });
      continue;
    }
    if (entry.status !== "published") {
      omitted.push({ id, reason: `Status is ${entry.status}. Only published records are exported.` });
      continue;
    }
    included.push(entry);
  }
  return { included, omitted };
}

export function renderDigest(entries: Entry[], ids: string[], generatedAt: string): DigestDocument {
  const { included, omitted } = selectForExport(entries, ids);
  const md: string[] = [];
  const html: string[] = [];
  md.push("# Quay digest");
  md.push("");
  md.push(`Generated: ${generatedAt} (UTC).`);
  md.push("");
  md.push("This digest contains editorial summaries, dates, and citations for records a local editor published.");
  md.push("It does not copy source abstracts, release notes, or unpublished drafts.");
  md.push("Facts and interpretation are separate sections. Quay does not send this file anywhere.");
  md.push("");
  if (omitted.length) {
    md.push("## Omitted ids");
    md.push("");
    for (const item of omitted) md.push(`- \`${item.id}\`: ${item.reason}`);
    md.push("");
  }
  if (!included.length) {
    md.push("No published records were included.");
  }

  html.push("<!DOCTYPE html>");
  html.push('<html lang="en"><head><meta charset="utf-8">');
  html.push("<title>Quay digest</title>");
  html.push('<meta name="robots" content="noindex">');
  html.push("<style>");
  html.push("body{margin:2rem auto;max-width:42rem;color:#1c1915;background:#f6f1e6;font-family:Georgia,serif;line-height:1.5}");
  html.push("h1{font-weight:500;letter-spacing:-0.03em} h2{font-size:1.3rem;margin-top:2rem}");
  html.push("a{color:#16352e} .meta{font-family:ui-monospace,monospace;font-size:0.85rem}");
  html.push("article{border-top:1px solid #d7cbb8;padding-top:1rem;margin-top:1.5rem}");
  html.push("</style></head><body>");
  html.push("<h1>Quay digest</h1>");
  html.push(`<p class="meta">Generated: ${escapeHtml(generatedAt)} (UTC).</p>`);
  html.push("<p>This digest contains editorial summaries, dates, and citations for records a local editor published. It does not copy source abstracts, release notes, or unpublished drafts. Facts and interpretation are separate sections. Quay does not send this file anywhere.</p>");
  if (omitted.length) {
    html.push("<h2>Omitted ids</h2><ul>");
    for (const item of omitted) {
      html.push(`<li><code>${escapeHtml(item.id)}</code>: ${escapeHtml(item.reason)}</li>`);
    }
    html.push("</ul>");
  }
  if (!included.length) html.push("<p>No published records were included.</p>");

  for (const entry of included) {
    md.push(`## ${entry.title}`);
    md.push("");
    md.push(`- Type: ${entry.type}`);
    md.push(`- Topics: ${entry.topics.join(", ") || "none"}`);
    md.push(`- Stable ID: ${entry.stableId}`);
    md.push(`- Canonical URL: ${entry.canonicalUrl}`);
    md.push(`- Publisher: ${entry.publisher ?? "Unknown"}`);
    md.push(`- Authors: ${entry.authors.join("; ") || "Not provided"}`);
    md.push(`- Publication date: ${formatUtc(entry.publishedAt, entry.datePrecision)}`);
    md.push(`- Source updated: ${entry.updatedAt ? `${entry.updatedAt} (UTC)` : "Date unknown"}`);
    md.push(`- Fetched: ${entry.fetchedAt} (UTC)`);
    md.push(`- Reviewed: ${entry.reviewedAt ? `${entry.reviewedAt} (UTC)` : "Date unknown"}`);
    md.push(`- Adapter: ${entry.adapterId}`);
    if (entry.sourceDrift) {
      md.push("- Source drift: the upstream response changed after review. This text was not auto-updated.");
    }
    md.push("");
    const facts = section("Facts", entry.factSummary);
    const interpretation = section("Interpretation", entry.interpretation);
    const relevance = section("Engineering relevance", entry.engineeringRelevance);
    const caveats = section("Caveats", entry.caveats);
    md.push(facts.markdown, interpretation.markdown, relevance.markdown, caveats.markdown);
    md.push("### Primary citations and context");
    md.push("");
    const lines = entry.citations.map(citationLine);
    if (!lines.length) md.push("- None recorded.");
    for (const line of lines) md.push(line.markdown);
    md.push("");

    html.push("<article>");
    html.push(`<h2>${escapeHtml(entry.title)}</h2>`);
    html.push("<ul class=\"meta\">");
    html.push(`<li>Type: ${escapeHtml(entry.type)}</li>`);
    html.push(`<li>Topics: ${escapeHtml(entry.topics.join(", ") || "none")}</li>`);
    html.push(`<li>Stable ID: ${escapeHtml(entry.stableId)}</li>`);
    html.push(`<li>Canonical URL: <a href="${escapeHtml(entry.canonicalUrl)}" rel="noopener noreferrer">${escapeHtml(entry.canonicalUrl)}</a></li>`);
    html.push(`<li>Publisher: ${escapeHtml(entry.publisher ?? "Unknown")}</li>`);
    html.push(`<li>Authors: ${escapeHtml(entry.authors.join("; ") || "Not provided")}</li>`);
    html.push(`<li>Publication date: ${escapeHtml(formatUtc(entry.publishedAt, entry.datePrecision))}</li>`);
    html.push(`<li>Source updated: ${escapeHtml(entry.updatedAt ? `${entry.updatedAt} (UTC)` : "Date unknown")}</li>`);
    html.push(`<li>Fetched: ${escapeHtml(entry.fetchedAt)} (UTC)</li>`);
    html.push(`<li>Reviewed: ${escapeHtml(entry.reviewedAt ? `${entry.reviewedAt} (UTC)` : "Date unknown")}</li>`);
    html.push(`<li>Adapter: ${escapeHtml(entry.adapterId)}</li>`);
    if (entry.sourceDrift) {
      html.push("<li>Source drift: the upstream response changed after review. This text was not auto-updated.</li>");
    }
    html.push("</ul>");
    html.push(facts.html, interpretation.html, relevance.html, caveats.html);
    html.push("<h3>Primary citations and context</h3><ul>");
    if (!lines.length) html.push("<li>None recorded.</li>");
    for (const line of lines) html.push(line.html);
    html.push("</ul></article>");
  }

  html.push("</body></html>");
  return { markdown: md.join("\n"), html: html.join("\n"), included, omitted };
}
