import { XMLParser } from "fast-xml-parser";
import type { DatabaseSync } from "node:sqlite";
import { parseSourceDate } from "@/lib/dates";
import { SourceHttpError } from "@/lib/errors";
import { getAdapterRuntime } from "@/lib/entries";
import type { Citation, SourceCandidate } from "@/lib/types";
import { parseArxivUrl } from "@/lib/urls";
import { getAdapter } from "@/lib/adapters/registry";
import { USER_AGENT, pinnedGet, pace, type FetchLike } from "@/lib/adapters/http";
import { getRequestCache, isFreshCache, putRequestCache, SOURCE_CACHE_MS } from "@/lib/request-cache";

export const ARXIV_CATEGORIES = ["cs.AI", "cs.CL", "cs.CV", "cs.LG"] as const;
export const ARXIV_MAX_RESULTS = 5;

export function arxivCategoryUrl(category: string): string {
  const query = new URLSearchParams({
    search_query: `cat:${category}`,
    start: "0",
    max_results: String(ARXIV_MAX_RESULTS),
    sortBy: "submittedDate",
    sortOrder: "descending",
  });
  return `https://export.arxiv.org/api/query?${query.toString()}`;
}

export const ARXIV_QUERY = arxivCategoryUrl("cs.LG");

export function mergeByStableId(candidates: SourceCandidate[]): SourceCandidate[] {
  const map = new Map<string, SourceCandidate>();
  for (const candidate of candidates) {
    const previous = map.get(candidate.stableId);
    if (!previous) {
      map.set(candidate.stableId, candidate);
      continue;
    }
    const topics = [...previous.topics];
    for (const topic of candidate.topics) {
      if (!topics.includes(topic)) topics.push(topic);
    }
    map.set(candidate.stableId, { ...previous, topics });
  }
  return [...map.values()];
}

const CATEGORY_TOPICS: Record<string, string> = {
  "cs.LG": "machine-learning",
  "cs.CL": "language",
  "cs.AI": "artificial-intelligence",
  "cs.CV": "vision",
  "cs.NE": "neural-computation",
  "cs.IR": "retrieval",
  "cs.SE": "software-engineering",
  "cs.DC": "distributed-systems",
  "cs.AR": "architecture",
  "cs.CR": "security",
  "cs.HC": "human-computer-interaction",
  "stat.ML": "statistics",
  "cs.RO": "robotics",
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  isArray: (name) => ["entry", "author", "link", "category"].includes(name),
  processEntities: true,
});

function asText(value: unknown): string {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (typeof value === "number") return String(value);
  return "";
}

function asArray(value: unknown): Record<string, unknown>[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
  if (typeof value === "object") return [value as Record<string, unknown>];
  return [];
}

export function topicsForCategories(terms: string[]): string[] {
  const topics: string[] = [];
  for (const term of terms) {
    const mapped = CATEGORY_TOPICS[term] ?? `cat-${term.toLowerCase().replace(/[^a-z0-9.]+/g, "-")}`;
    if (!topics.includes(mapped)) topics.push(mapped);
  }
  return topics.slice(0, 8);
}

export function mechanicalArxivSummary(input: {
  arxivId: string;
  versionLabel: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  categories: string[];
  authorCount: number;
}): string {
  const version = input.versionLabel ?? "no version suffix in the abstract-page URL";
  const published = input.publishedAt ?? "absent";
  const updated = input.updatedAt ?? "absent";
  const categories = input.categories.length ? input.categories.join(", ") : "none listed";
  return `arXiv metadata for ${input.arxivId} (${version}) gives the title shown on this record. The API published timestamp is ${published}. The API updated timestamp is ${updated}. Category terms: ${categories}. Author count in the response: ${input.authorCount}. This sentence only restates those fields. It does not restate the abstract.`;
}

export function parseArxivAtom(xml: string, fetchedRequestUrl = ARXIV_QUERY): { candidates: SourceCandidate[]; skipped: number } {
  const trimmed = xml.trim();
  if (/<!DOCTYPE|<!ENTITY/i.test(trimmed)) {
    throw new SourceHttpError(200, "Refusing XML with a doctype or entity declaration.");
  }
  if (!trimmed.startsWith("<?xml") && !trimmed.startsWith("<feed")) {
    throw new SourceHttpError(200, "arXiv response was not an Atom feed.");
  }
  const doc = parser.parse(trimmed) as { feed?: { entry?: unknown } };
  const entries = asArray(doc.feed?.entry);
  if (!entries.length) return { candidates: [], skipped: 0 };
  if (entries.length === 1 && asText(entries[0]?.title).toLowerCase() === "error") {
    throw new SourceHttpError(200, `arXiv API error: ${asText(entries[0]?.summary).slice(0, 240)}`);
  }

  const candidates: SourceCandidate[] = [];
  let skipped = 0;
  for (const entry of entries) {
    const links = asArray(entry.link);
    const alternate = links.find((link) => asText(link["@_rel"]) === "alternate");
    const href = asText(alternate?.["@_href"]) || asText(entry.id);
    const parsed = parseArxivUrl(href);
    if (!parsed) {
      skipped += 1;
      continue;
    }
    const categories = asArray(entry.category)
      .map((category) => asText(category["@_term"]))
      .filter(Boolean);
    const authors = asArray(entry.author)
      .map((author) => asText(author.name))
      .filter(Boolean)
      .slice(0, 40);
    const published = parseSourceDate(asText(entry.published));
    const updated = parseSourceDate(asText(entry.updated));
    let excerpt = asText(entry.summary);
    if (excerpt.length > 4000) excerpt = `${excerpt.slice(0, 4000)} [truncated by Quay at 4000 characters]`;
    const citations: Citation[] = [{ label: "arXiv abstract page", url: parsed.canonicalUrl, role: "primary" }];
    const pdf = links.find((link) => asText(link["@_title"]) === "pdf");
    const pdfUrl = asText(pdf?.["@_href"]);
    if (pdfUrl.startsWith("https://arxiv.org/pdf/") || pdfUrl.startsWith("http://arxiv.org/pdf/")) {
      citations.push({ label: "arXiv PDF (linked, not stored)", url: pdfUrl, role: "context" });
    }
    const title = asText(entry.title);
    if (!title) {
      skipped += 1;
      continue;
    }
    candidates.push({
      origin: "live",
      type: "paper",
      title,
      canonicalUrl: parsed.canonicalUrl,
      stableId: parsed.stableId,
      baseId: parsed.baseId,
      versionLabel: parsed.versionLabel,
      publisher: "arXiv",
      authors,
      topics: topicsForCategories(categories),
      publishedAt: published.iso,
      updatedAt: updated.iso,
      datePrecision: published.precision,
      publishedRaw: published.raw,
      updatedRaw: updated.raw,
      sourceExcerpt: excerpt || null,
      excerptLicense: "CC0 1.0 descriptive metadata from the arXiv API. Untrusted source text.",
      sourceLabel: null,
      adapterId: "arxiv",
      sourceRequestUrl: fetchedRequestUrl,
      citations,
      factSummary: mechanicalArxivSummary({
        arxivId: parsed.arxivId,
        versionLabel: parsed.versionLabel,
        publishedAt: published.iso,
        updatedAt: updated.iso,
        categories,
        authorCount: authors.length,
      }),
      factSummaryKind: "mechanical",
      licenseNote:
        "Descriptive metadata from the arXiv API is used under CC0 1.0. The e-print file is not stored. Quay is not endorsed by arXiv.",
    });
  }
  return { candidates, skipped };
}

function legacyCsLgRecent(db: DatabaseSync, nowIso: string): boolean {
  const runtime = getAdapterRuntime(db, "arxiv");
  if (!runtime.lastSuccessAt) return false;
  const elapsed = Date.parse(nowIso) - Date.parse(runtime.lastSuccessAt);
  return !Number.isNaN(elapsed) && elapsed >= 0 && elapsed < SOURCE_CACHE_MS;
}

export async function fetchArxiv(
  db: DatabaseSync,
  fetchImpl: FetchLike,
  sleep: (ms: number) => Promise<void>,
  options: { now: string; force?: boolean } = { now: new Date().toISOString() },
) {
  const adapter = getAdapter("arxiv");
  if (!adapter) throw new SourceHttpError(0, "arXiv adapter is missing.");
  const force = options.force === true;
  const candidates: SourceCandidate[] = [];
  let skipped = 0;
  let httpStatus = 0;
  let halted: string | null = null;

  for (const category of ARXIV_CATEGORIES) {
    const url = arxivCategoryUrl(category);
    const cache = getRequestCache(db, url);
    if (isFreshCache(cache, options.now, force)) {
      skipped += 1;
      continue;
    }
    if (!force && category === "cs.LG" && !cache && legacyCsLgRecent(db, options.now)) {
      putRequestCache(db, url, { etag: null, lastModified: null, fetchedAt: options.now, status: "legacy-skip" });
      skipped += 1;
      continue;
    }
    await pace(db, adapter.id, adapter.minGapMs, sleep);
    const response = await pinnedGet(
      fetchImpl,
      url,
      "export.arxiv.org",
      { accept: "application/atom+xml", "user-agent": USER_AGENT },
      { etag: cache?.etag, lastModified: cache?.lastModified },
    );
    httpStatus = response.status;
    if (response.status === 304) {
      putRequestCache(db, url, {
        etag: response.headers.get("etag") ?? cache?.etag ?? null,
        lastModified: response.headers.get("last-modified") ?? cache?.lastModified ?? null,
        fetchedAt: options.now,
        status: "not-modified",
      });
      skipped += 1;
      continue;
    }
    if (response.status === 429 || response.status === 403) {
      halted = `arXiv ${category} returned HTTP ${response.status}. Later categories were not called, and this response was not retried.`;
      break;
    }
    if (response.status < 200 || response.status >= 300) {
      halted = `arXiv ${category} returned HTTP ${response.status}. Later categories were not called.`;
      break;
    }
    const parsed = parseArxivAtom(response.body, url);
    candidates.push(...parsed.candidates);
    skipped += parsed.skipped;
    putRequestCache(db, url, {
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      fetchedAt: options.now,
      status: "ok",
    });
  }

  return { candidates: mergeByStableId(candidates), skipped, httpStatus, halted };
}
