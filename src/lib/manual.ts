import { createHash } from "node:crypto";
import { parseSourceDate } from "@/lib/dates";
import { EditorError } from "@/lib/errors";
import type { Citation, EntryType, SourceCandidate } from "@/lib/types";
import { ENTRY_TYPES } from "@/lib/types";
import { normalizeCanonicalUrl } from "@/lib/urls";

export type ManualInput = {
  type?: string;
  title?: string;
  canonicalUrl?: string;
  publisher?: string;
  authors?: unknown;
  topics?: unknown;
  publishedAt?: string;
  factSummary?: string;
  interpretation?: string;
  engineeringRelevance?: string;
  caveats?: string;
  citations?: unknown;
};

function stringList(value: unknown, label: string, max: number): string[] {
  if (!Array.isArray(value)) throw new EditorError(label, `${label} must be a list of strings.`);
  if (value.length > max) throw new EditorError(label, `Use at most ${max} ${label}.`);
  return value.map((item) => {
    if (typeof item !== "string" || !item.trim()) throw new EditorError(label, `${label} entries must be non-empty strings.`);
    if (item.trim().length > 200) throw new EditorError(label, `A ${label} entry is too long.`);
    return item.trim();
  });
}

export function manualCandidate(input: ManualInput): SourceCandidate {
  const type = input.type;
  if (!type || !ENTRY_TYPES.includes(type as EntryType)) throw new EditorError("type", "Choose a type: news, model, paper, repo, or tool.");
  const title = input.title?.trim().replace(/\s+/g, " ") ?? "";
  if (title.length < 8 || title.length > 300) throw new EditorError("title", "Title must be 8 to 300 characters.");
  const canonicalUrl = normalizeCanonicalUrl(input.canonicalUrl ?? "");
  if (!canonicalUrl) throw new EditorError("url", "Canonical URL must be an http(s) URL without credentials.");
  const factSummary = input.factSummary?.trim() ?? "";
  if (factSummary.length < 40 || factSummary.length > 4000) {
    throw new EditorError("summary", "Write a factual summary of at least 40 characters. This stays a draft until you publish it.");
  }
  const citationsRaw = input.citations;
  if (!Array.isArray(citationsRaw) || citationsRaw.length < 1) {
    throw new EditorError("citation", "Add at least one primary citation.");
  }
  const citations: Citation[] = citationsRaw.map((item) => {
    if (!item || typeof item !== "object") throw new EditorError("citation", "Each citation needs a label, URL, and role.");
    const record = item as { label?: string; url?: string; role?: string };
    const label = record.label?.trim() ?? "";
    const url = normalizeCanonicalUrl(record.url ?? "");
    if (label.length < 2 || !url) throw new EditorError("citation", "Each citation needs a label and an http(s) URL.");
    if (record.role !== "primary" && record.role !== "context") throw new EditorError("citation", "Citation role must be primary or context.");
    return { label, url, role: record.role };
  });
  if (!citations.some((citation) => citation.role === "primary")) {
    throw new EditorError("citation", "One citation must be marked primary.");
  }
  const topics = input.topics == null ? [] : stringList(input.topics, "topics", 8).map((topic) => topic.toLowerCase());
  for (const topic of topics) {
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(topic)) throw new EditorError("topic", `Topic "${topic}" must be a short lowercase slug.`);
  }
  const authors = input.authors == null ? [] : stringList(input.authors, "authors", 40);
  const parsed = parseSourceDate(input.publishedAt ?? "");
  if (input.publishedAt && input.publishedAt.trim() && !parsed.iso) {
    throw new EditorError("date", "Publication date could not be parsed. Leave it empty if it is unknown.");
  }
  const publisher = input.publisher?.trim() || null;
  if (publisher && publisher.length > 200) throw new EditorError("publisher", "Publisher is too long.");
  const stableId = `manual:${createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 24)}`;
  return {
    origin: "manual",
    type: type as EntryType,
    title,
    canonicalUrl,
    stableId,
    baseId: null,
    versionLabel: null,
    publisher,
    authors,
    topics,
    publishedAt: parsed.iso,
    updatedAt: null,
    datePrecision: parsed.precision,
    publishedRaw: parsed.raw,
    updatedRaw: null,
    sourceExcerpt: null,
    excerptLicense: null,
    sourceLabel: null,
    adapterId: "manual",
    sourceRequestUrl: null,
    citations,
    factSummary,
    factSummaryKind: "editor",
    interpretation: input.interpretation?.trim().slice(0, 4000) ?? "",
    engineeringRelevance: input.engineeringRelevance?.trim().slice(0, 4000) ?? "",
    caveats: input.caveats?.trim().slice(0, 4000) ?? "",
    licenseNote: "Entered by the local editor. Quay did not fetch the page body.",
  };
}
