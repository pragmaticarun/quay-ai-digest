import type { DatabaseSync } from "node:sqlite";
import { parseSourceDate } from "@/lib/dates";
import { SourceHttpError } from "@/lib/errors";
import type { Citation, SourceCandidate } from "@/lib/types";
import { normalizeCanonicalUrl } from "@/lib/urls";
import { fetchOneCached } from "@/lib/adapters/cached-get";
import type { FetchLike } from "@/lib/adapters/http";

const openAlexParams = new URLSearchParams({
  filter: "primary_topic.subfield.id:1702,type:article|preprint",
  sort: "publication_date:desc",
  per_page: "5",
  select: "id,display_name,publication_date,doi,updated_date,type,authorships,primary_location",
});

export const OPENALEX_WORKS_URL = `https://api.openalex.org/works?${openAlexParams.toString()}`;

const WORK_ID = /^https:\/\/openalex\.org\/(W\d+)$/;

type OpenAlexWork = {
  id?: unknown;
  display_name?: unknown;
  publication_date?: unknown;
  doi?: unknown;
  updated_date?: unknown;
  type?: unknown;
  authorships?: unknown;
  abstract_inverted_index?: unknown;
  primary_location?: unknown;
};

function authorNames(value: unknown): { names: string[]; count: number } {
  if (!Array.isArray(value)) return { names: [], count: 0 };
  const names: string[] = [];
  let count = 0;
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const author = (item as { author?: { display_name?: unknown } }).author;
    const name = typeof author?.display_name === "string" ? author.display_name.replace(/\s+/g, " ").trim() : "";
    if (!name) continue;
    count += 1;
    if (names.length < 8 && name.length <= 200) names.push(name);
  }
  return { names, count };
}

function publisherName(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const source = (value as { source?: { display_name?: unknown } }).source;
  const name = typeof source?.display_name === "string" ? source.display_name.replace(/\s+/g, " ").trim() : "";
  if (!name || name.length > 160) return null;
  return name;
}

export function parseOpenAlexWorks(body: string, requestUrl: string): { candidates: SourceCandidate[]; skipped: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new SourceHttpError(200, "OpenAlex response was not JSON.");
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { results?: unknown }).results)) {
    const message = parsed && typeof parsed === "object" && "error" in parsed ? String((parsed as { error?: unknown }).error) : "missing results";
    throw new SourceHttpError(200, `OpenAlex works payload: ${message.slice(0, 180)}`);
  }
  const candidates: SourceCandidate[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const item of (parsed as { results: OpenAlexWork[] }).results) {
    if (!item || typeof item !== "object") {
      skipped += 1;
      continue;
    }
    const match = typeof item.id === "string" ? WORK_ID.exec(item.id) : null;
    const title = typeof item.display_name === "string" ? item.display_name.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) : "";
    const kind = item.type === "article" || item.type === "preprint" ? item.type : null;
    if (!match || !title || !kind) {
      skipped += 1;
      continue;
    }
    const workId = match[1];
    if (!workId || seen.has(workId)) {
      skipped += 1;
      continue;
    }
    seen.add(workId);
    const openAlexUrl = `https://openalex.org/${workId}`;
    const doi = typeof item.doi === "string" ? normalizeCanonicalUrl(item.doi) : null;
    const canonical = doi && doi.startsWith("https://doi.org/") ? doi : openAlexUrl;
    const published = parseSourceDate(typeof item.publication_date === "string" ? item.publication_date : "");
    const updated = parseSourceDate(typeof item.updated_date === "string" ? item.updated_date : "");
    const authors = authorNames(item.authorships);
    const citations: Citation[] = [{ label: "OpenAlex work", url: openAlexUrl, role: "context" }];
    if (canonical !== openAlexUrl) citations.unshift({ label: "DOI", url: canonical, role: "primary" });
    else citations[0] = { label: "OpenAlex work", url: openAlexUrl, role: "primary" };
    candidates.push({
      origin: "live",
      type: "paper",
      title,
      canonicalUrl: canonical,
      stableId: `openalex:${workId}`,
      baseId: `openalex:${workId}`,
      versionLabel: null,
      publisher: publisherName(item.primary_location) ?? "OpenAlex",
      authors: authors.names,
      topics: ["artificial-intelligence", kind],
      publishedAt: published.iso,
      updatedAt: updated.iso,
      datePrecision: published.iso ? published.precision : "unknown",
      publishedRaw: published.raw,
      updatedRaw: updated.raw,
      sourceExcerpt: null,
      excerptLicense: null,
      sourceLabel: null,
      adapterId: "openalex-works",
      sourceRequestUrl: requestUrl,
      citations,
      factSummary: `OpenAlex lists this ${kind} in Artificial Intelligence (subfield 1702). publication_date is ${published.iso ?? "absent"} and is stored as publishedAt. updated_date is ${updated.iso ?? "absent"} and is the catalog update time, stored only as updatedAt. Author count in the response: ${authors.count}. The abstract was not requested or stored.`,
      factSummaryKind: "mechanical",
      licenseNote:
        "Identifiers come from the public OpenAlex works API. Abstracts and full text are not copied. The operator accepted responsibility for reuse on 8 November 2026. Quay has not independently verified that the OpenAlex terms grant republication.",
    });
  }
  return { candidates, skipped };
}

export function fetchOpenAlexWorks(
  db: DatabaseSync,
  fetchImpl: FetchLike,
  sleep: (ms: number) => Promise<void>,
  options: { now: string; force?: boolean } = { now: new Date().toISOString() },
) {
  const key = process.env.QUAY_OPENALEX_API_KEY?.trim();
  const headers: Record<string, string> = { accept: "application/json" };
  if (key && !/[\r\n]/.test(key)) headers.authorization = `Bearer ${key}`;
  return fetchOneCached(db, fetchImpl, sleep, options, {
    adapterId: "openalex-works",
    url: OPENALEX_WORKS_URL,
    host: "api.openalex.org",
    headers,
    haltNote: (status) =>
      status === 401 || status === 402 || status === 403
        ? "Anonymous OpenAlex access was refused. A local QUAY_OPENALEX_API_KEY can be set in the environment; it is not read from the repository and was not invented here."
        : "",
    parse: parseOpenAlexWorks,
  });
}
