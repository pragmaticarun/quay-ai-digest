import { escapeHtml } from "@/lib/escape";
import type { Citation, DatePrecision, Entry, EntryType } from "@/lib/types";
import { ENTRY_TYPES } from "@/lib/types";
import { isPublicEntry } from "@/lib/entries";
import { normalizeCanonicalUrl } from "@/lib/urls";

export type PagesRecord = {
  id: string;
  type: EntryType;
  title: string;
  topics: string[];
  publisher: string | null;
  authors: string[];
  canonicalUrl: string;
  stableId: string;
  versionLabel: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  fetchedAt: string;
  reviewedAt: string | null;
  datePrecision: DatePrecision;
  factSummary: string;
  interpretation: string;
  engineeringRelevance: string;
  caveats: string;
  licenseNote: string;
  citations: Citation[];
  sourceDrift: boolean;
  adapterId: string;
  sourceLabel: string | null;
};

const PRIVATE_KEYS = [
  "reviewNote",
  "sourceExcerpt",
  "sourceRequestUrl",
  "pendingSource",
  "pending_source_json",
  "excerptLicense",
  "contentHash",
  "origin",
  "token",
  "editorToken",
];

export function pagesBase(input: string | undefined): string {
  if (!input) return "";
  const trimmed = input.trim();
  if (!trimmed || trimmed === "/") return "";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const base = withSlash.replace(/\/+$/, "");
  if (!/^\/[A-Za-z0-9._/-]+$/.test(base) || base.includes("..") || base.includes("//")) {
    throw new Error("QUAY_PAGES_BASE must be a slash-prefixed path without .. or a scheme.");
  }
  return base;
}

export function toPagesRecord(entry: Entry): PagesRecord | null {
  if (!isPublicEntry(entry)) return null;
  const canonicalUrl = normalizeCanonicalUrl(entry.canonicalUrl);
  if (!canonicalUrl) return null;
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(entry.id)) return null;
  return {
    id: entry.id,
    type: entry.type,
    title: entry.title,
    topics: entry.topics,
    publisher: entry.publisher,
    authors: entry.authors,
    canonicalUrl,
    stableId: entry.stableId,
    versionLabel: entry.versionLabel,
    publishedAt: entry.publishedAt,
    updatedAt: entry.updatedAt,
    fetchedAt: entry.fetchedAt,
    reviewedAt: entry.reviewedAt,
    datePrecision: entry.datePrecision,
    factSummary: entry.factSummary,
    interpretation: entry.interpretation,
    engineeringRelevance: entry.engineeringRelevance,
    caveats: entry.caveats,
    licenseNote: entry.licenseNote,
    citations: entry.citations.filter((citation) => normalizeCanonicalUrl(citation.url)),
    sourceDrift: entry.sourceDrift,
    adapterId: entry.adapterId,
    sourceLabel: entry.sourceLabel,
  };
}

export function assertPagesSnapshot(value: unknown): PagesRecord[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { records?: unknown }).records)) {
    throw new Error("The Pages snapshot must be an object with a records array.");
  }
  const records = (value as { records: unknown[] }).records;
  return records.map((record, index) => {
    if (!record || typeof record !== "object") throw new Error(`Record ${index} is not an object.`);
    const raw = record as Record<string, unknown>;
    for (const key of PRIVATE_KEYS) {
      if (key in raw && raw[key]) throw new Error(`Record ${index} contains private field ${key}.`);
    }
    if (raw.origin === "fixture" || raw.status === "draft" || raw.status === "rejected" || raw.status === "in_review") {
      throw new Error(`Record ${index} is not a published public record.`);
    }
    if (typeof raw.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(raw.id)) throw new Error(`Record ${index} has an unsafe id.`);
    if (typeof raw.title !== "string" || !raw.title.trim()) throw new Error(`Record ${index} needs a title.`);
    if (typeof raw.type !== "string" || !ENTRY_TYPES.includes(raw.type as EntryType)) throw new Error(`Record ${index} has an unknown type.`);
    const canonicalUrl = typeof raw.canonicalUrl === "string" ? normalizeCanonicalUrl(raw.canonicalUrl) : null;
    if (!canonicalUrl) throw new Error(`Record ${index} needs an http(s) canonical URL.`);
    if (typeof raw.factSummary !== "string" || raw.factSummary.trim().length < 40) {
      throw new Error(`Record ${index} needs an editorial factual summary.`);
    }
    const citations = Array.isArray(raw.citations) ? raw.citations : [];
    const safeCitations: Citation[] = [];
    for (const citation of citations) {
      if (!citation || typeof citation !== "object") continue;
      const item = citation as { label?: unknown; url?: unknown; role?: unknown };
      const url = typeof item.url === "string" ? normalizeCanonicalUrl(item.url) : null;
      if (!url || (item.role !== "primary" && item.role !== "context") || typeof item.label !== "string") continue;
      safeCitations.push({ label: item.label, url, role: item.role });
    }
    if (!safeCitations.some((citation) => citation.role === "primary")) {
      throw new Error(`Record ${index} needs a primary http(s) citation.`);
    }
    return {
      id: raw.id,
      type: raw.type as EntryType,
      title: raw.title,
      topics: Array.isArray(raw.topics) ? raw.topics.filter((topic): topic is string => typeof topic === "string").slice(0, 12) : [],
      publisher: typeof raw.publisher === "string" ? raw.publisher : null,
      authors: Array.isArray(raw.authors) ? raw.authors.filter((author): author is string => typeof author === "string").slice(0, 40) : [],
      canonicalUrl,
      stableId: typeof raw.stableId === "string" ? raw.stableId : raw.id,
      versionLabel: typeof raw.versionLabel === "string" ? raw.versionLabel : null,
      publishedAt: typeof raw.publishedAt === "string" ? raw.publishedAt : null,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
      fetchedAt: typeof raw.fetchedAt === "string" ? raw.fetchedAt : "",
      reviewedAt: typeof raw.reviewedAt === "string" ? raw.reviewedAt : null,
      datePrecision: raw.datePrecision === "date" || raw.datePrecision === "unknown" ? raw.datePrecision : "datetime",
      factSummary: raw.factSummary,
      interpretation: typeof raw.interpretation === "string" ? raw.interpretation : "",
      engineeringRelevance: typeof raw.engineeringRelevance === "string" ? raw.engineeringRelevance : "",
      caveats: typeof raw.caveats === "string" ? raw.caveats : "",
      licenseNote: typeof raw.licenseNote === "string" ? raw.licenseNote : "",
      citations: safeCitations,
      sourceDrift: raw.sourceDrift === true,
      adapterId: typeof raw.adapterId === "string" ? raw.adapterId : "manual",
      sourceLabel: typeof raw.sourceLabel === "string" ? raw.sourceLabel : null,
    };
  });
}

export function pagesDigestMarkdown(records: PagesRecord[], generatedAt: string): string {
  const lines = [
    "# Quay digest",
    "",
    `Generated: ${generatedAt} (UTC).`,
    "",
    "This file lists reviewed records from the public snapshot. It does not include drafts, fixtures, or source excerpts.",
    "",
  ];
  if (!records.length) {
    lines.push("No published records were included.");
    return lines.join("\n");
  }
  for (const record of records) {
    lines.push(`## ${record.title}`, "", `- Type: ${record.type}`, `- Stable ID: ${record.stableId}`, `- Canonical URL: ${record.canonicalUrl}`);
    lines.push(`- Publication date: ${record.publishedAt ?? "Date unknown"}`);
    lines.push(`- Source updated: ${record.updatedAt ?? "Date unknown"}`);
    lines.push("", "### Facts", "", record.factSummary, "", "### Interpretation", "", record.interpretation || "None recorded.", "", "### Citations", "");
    for (const citation of record.citations) lines.push(`- ${citation.label} (${citation.role}): ${citation.url}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function jsonForHtml(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
}

export function text(value: string | null | undefined): string {
  return escapeHtml(value ?? "");
}
