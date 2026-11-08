import { XMLParser } from "fast-xml-parser";
import type { DatabaseSync } from "node:sqlite";
import { parseSourceDate } from "@/lib/dates";
import { SourceHttpError } from "@/lib/errors";
import type { EntryType, SourceCandidate } from "@/lib/types";
import { normalizeCanonicalUrl } from "@/lib/urls";
import { fetchOneCached, type FetchBatch } from "@/lib/adapters/cached-get";
import type { FetchLike } from "@/lib/adapters/http";

export const FEED_MAX_ITEMS = 5;

export type RssFeedSpec = {
  adapterId: string;
  feedUrl: string;
  host: string;
  linkHosts: readonly string[];
  pathPrefix?: string;
  type: EntryType;
  publisher: string;
  topics: string[];
  licenseNote: string;
};

export const HUGGINGFACE_BLOG: RssFeedSpec = {
  adapterId: "huggingface-blog",
  feedUrl: "https://huggingface.co/blog/feed.xml",
  host: "huggingface.co",
  linkHosts: ["huggingface.co"],
  pathPrefix: "/blog/",
  type: "news",
  publisher: "Hugging Face",
  topics: ["huggingface", "news"],
  licenseNote:
    "Title, link, and pubDate come from the public Hugging Face blog RSS feed. Descriptions and article bodies are not stored. The operator accepted responsibility for reuse on 8 November 2026. Quay has not independently verified that the Hugging Face terms grant republication.",
};

export const OPENAI_NEWS: RssFeedSpec = {
  adapterId: "openai-news",
  feedUrl: "https://openai.com/news/rss.xml",
  host: "openai.com",
  linkHosts: ["openai.com"],
  type: "news",
  publisher: "OpenAI",
  topics: ["openai", "news"],
  licenseNote:
    "Title, link, and pubDate come from the public OpenAI news RSS feed. Descriptions and article bodies are not stored. The operator accepted responsibility for reuse on 8 November 2026. Quay has not independently verified that the OpenAI terms grant republication.",
};

export const DEEPMIND_BLOG: RssFeedSpec = {
  adapterId: "deepmind-blog",
  feedUrl: "https://deepmind.google/blog/rss.xml",
  host: "deepmind.google",
  linkHosts: ["deepmind.google"],
  pathPrefix: "/blog/",
  type: "news",
  publisher: "Google DeepMind",
  topics: ["deepmind", "news"],
  licenseNote:
    "Title, link, and pubDate come from the public Google DeepMind blog RSS feed. Descriptions and article bodies are not stored. The operator accepted responsibility for reuse on 8 November 2026. Quay has not independently verified that the Google terms grant republication.",
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  isArray: (name) => name === "item",
  processEntities: true,
  trimValues: true,
});

function nodeText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).replace(/\s+/g, " ").trim();
  if (value && typeof value === "object" && "#text" in value) {
    const text = (value as { "#text"?: unknown })["#text"];
    if (typeof text === "string" || typeof text === "number") return String(text).replace(/\s+/g, " ").trim();
  }
  return "";
}

export function plainTitle(value: unknown): string {
  return nodeText(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
}

export function httpsOnHost(raw: string, hosts: readonly string[], pathPrefix?: string): string | null {
  const canonical = normalizeCanonicalUrl(raw);
  if (!canonical) return null;
  let url: URL;
  try {
    url = new URL(canonical);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!hosts.includes(url.hostname)) return null;
  if (pathPrefix && !url.pathname.startsWith(pathPrefix)) return null;
  return canonical;
}

export function parseRssFeed(xml: string, spec: RssFeedSpec): { candidates: SourceCandidate[]; skipped: number } {
  const trimmed = xml.trim();
  if (/<!DOCTYPE|<!ENTITY/i.test(trimmed)) {
    throw new SourceHttpError(200, "Refusing XML with a doctype or entity declaration.");
  }
  if (!trimmed.startsWith("<?xml") && !trimmed.startsWith("<rss")) {
    throw new SourceHttpError(200, "Response was not an RSS 2.0 document.");
  }
  const doc = parser.parse(trimmed) as { rss?: { channel?: { item?: unknown } } };
  const items = Array.isArray(doc.rss?.channel?.item) ? doc.rss.channel.item : [];
  const candidates: SourceCandidate[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const item of items) {
    if (candidates.length >= FEED_MAX_ITEMS) break;
    if (!item || typeof item !== "object") {
      skipped += 1;
      continue;
    }
    const record = item as Record<string, unknown>;
    const title = plainTitle(record.title);
    const link = httpsOnHost(nodeText(record.link), spec.linkHosts, spec.pathPrefix);
    const guid = httpsOnHost(nodeText(record.guid), spec.linkHosts, spec.pathPrefix);
    const canonical = guid ?? link;
    if (!title || !canonical) {
      skipped += 1;
      continue;
    }
    if (seen.has(canonical)) {
      skipped += 1;
      continue;
    }
    seen.add(canonical);
    const published = parseSourceDate(nodeText(record.pubDate));
    candidates.push({
      origin: "live",
      type: spec.type,
      title,
      canonicalUrl: canonical,
      stableId: `${spec.adapterId}:${canonical}`,
      baseId: null,
      versionLabel: null,
      publisher: spec.publisher,
      authors: [],
      topics: spec.topics,
      publishedAt: published.iso,
      updatedAt: null,
      datePrecision: published.iso ? published.precision : "unknown",
      publishedRaw: published.raw,
      updatedRaw: null,
      sourceExcerpt: null,
      excerptLicense: null,
      sourceLabel: null,
      adapterId: spec.adapterId,
      sourceRequestUrl: spec.feedUrl,
      citations: [{ label: `${spec.publisher} post`, url: canonical, role: "primary" }],
      factSummary: `${spec.publisher} RSS lists this title. pubDate is ${published.iso ?? "absent"} and is stored as the publication time. No separate modification time was read. The description and the article body were not stored.`,
      factSummaryKind: "mechanical",
      licenseNote: spec.licenseNote,
    });
  }
  return { candidates, skipped };
}

async function fetchFeed(
  db: DatabaseSync,
  fetchImpl: FetchLike,
  sleep: (ms: number) => Promise<void>,
  options: { now: string; force?: boolean },
  spec: RssFeedSpec,
): Promise<FetchBatch> {
  return fetchOneCached(db, fetchImpl, sleep, options, {
    adapterId: spec.adapterId,
    url: spec.feedUrl,
    host: spec.host,
    headers: { accept: "application/rss+xml, application/xml, text/xml" },
    parse: (body) => parseRssFeed(body, spec),
  });
}

export function fetchHuggingFaceBlog(
  db: DatabaseSync,
  fetchImpl: FetchLike,
  sleep: (ms: number) => Promise<void>,
  options: { now: string; force?: boolean } = { now: new Date().toISOString() },
) {
  return fetchFeed(db, fetchImpl, sleep, options, HUGGINGFACE_BLOG);
}

export function fetchOpenAiNews(
  db: DatabaseSync,
  fetchImpl: FetchLike,
  sleep: (ms: number) => Promise<void>,
  options: { now: string; force?: boolean } = { now: new Date().toISOString() },
) {
  return fetchFeed(db, fetchImpl, sleep, options, OPENAI_NEWS);
}

export function fetchDeepMindBlog(
  db: DatabaseSync,
  fetchImpl: FetchLike,
  sleep: (ms: number) => Promise<void>,
  options: { now: string; force?: boolean } = { now: new Date().toISOString() },
) {
  return fetchFeed(db, fetchImpl, sleep, options, DEEPMIND_BLOG);
}
