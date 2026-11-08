import type { Entry } from "@/lib/types";

export function toPublicEntry(entry: Entry, includeExcerpt: boolean) {
  return {
    id: entry.id,
    status: "published" as const,
    type: entry.type,
    title: entry.title,
    topics: entry.topics,
    publisher: entry.publisher,
    authors: entry.authors,
    canonicalUrl: entry.canonicalUrl,
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
    citations: entry.citations,
    sourceDrift: entry.sourceDrift,
    adapterId: entry.adapterId,
    sourceLabel: includeExcerpt ? entry.sourceLabel : null,
    sourceExcerpt: includeExcerpt ? entry.sourceExcerpt : null,
    excerptLicense: includeExcerpt ? entry.excerptLicense : null,
  };
}
