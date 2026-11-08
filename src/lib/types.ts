export const ENTRY_TYPES = ["news", "model", "paper", "repo", "tool"] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const REVIEW_STATUSES = [
  "fetched",
  "normalized",
  "draft",
  "in_review",
  "published",
  "rejected",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const ORIGINS = ["live", "fixture", "manual"] as const;
export type Origin = (typeof ORIGINS)[number];

export const DATE_PRECISIONS = ["datetime", "date", "unknown"] as const;
export type DatePrecision = (typeof DATE_PRECISIONS)[number];

export const FACT_KINDS = ["none", "mechanical", "editor"] as const;
export type FactKind = (typeof FACT_KINDS)[number];

export type Citation = {
  label: string;
  url: string;
  role: "primary" | "context";
};

export type SimilarityFlag = {
  otherId: string;
  score: number;
  reason: "title-token-overlap";
};

export type PendingSource = {
  title: string;
  canonicalUrl: string;
  publishedAt: string | null;
  updatedAt: string | null;
  datePrecision: DatePrecision;
  publishedRaw: string | null;
  updatedRaw: string | null;
  authors: string[];
  sourceExcerpt: string | null;
  sourceLabel: string | null;
  contentHash: string;
  versionLabel: string | null;
  citations: Citation[];
};

export type Entry = {
  id: string;
  origin: Origin;
  status: ReviewStatus;
  type: EntryType;
  title: string;
  canonicalUrl: string;
  stableId: string;
  baseId: string | null;
  versionLabel: string | null;
  publisher: string | null;
  authors: string[];
  topics: string[];
  publishedAt: string | null;
  updatedAt: string | null;
  fetchedAt: string;
  lastSeenAt: string;
  datePrecision: DatePrecision;
  publishedRaw: string | null;
  updatedRaw: string | null;
  factSummary: string;
  factSummaryKind: FactKind;
  interpretation: string;
  engineeringRelevance: string;
  caveats: string;
  licenseNote: string;
  sourceExcerpt: string | null;
  excerptLicense: string | null;
  sourceLabel: string | null;
  adapterId: string;
  sourceRequestUrl: string | null;
  citations: Citation[];
  contentHash: string;
  sourceDrift: boolean;
  pendingSource: PendingSource | null;
  duplicateOf: string | null;
  similarity: SimilarityFlag[];
  relatedIds: string[];
  reviewNote: string;
  createdAt: string;
  reviewedAt: string | null;
};

export type ReviewEvent = {
  id: number;
  entryId: string;
  at: string;
  action: string;
  note: string;
};

export type IngestRun = {
  id: string;
  adapterId: string;
  startedAt: string;
  finishedAt: string | null;
  outcome: "running" | "ok" | "error" | "skipped";
  httpStatus: number | null;
  message: string;
  fetchedCount: number;
  createdCount: number;
  unchangedCount: number;
  updatedCount: number;
  driftCount: number;
  conflictCount: number;
  skippedCount: number;
};

export type PublicQuery = {
  q?: string;
  type?: string;
  topic?: string;
  from?: string;
  to?: string;
};

export type SourceCandidate = {
  origin: Origin;
  type: EntryType;
  title: string;
  canonicalUrl: string;
  stableId: string;
  baseId: string | null;
  versionLabel: string | null;
  publisher: string | null;
  authors: string[];
  topics: string[];
  publishedAt: string | null;
  updatedAt: string | null;
  datePrecision: DatePrecision;
  publishedRaw: string | null;
  updatedRaw: string | null;
  sourceExcerpt: string | null;
  excerptLicense: string | null;
  sourceLabel: string | null;
  adapterId: string;
  sourceRequestUrl: string | null;
  citations: Citation[];
  factSummary: string;
  factSummaryKind: FactKind;
  licenseNote: string;
  engineeringRelevance?: string;
  interpretation?: string;
  caveats?: string;
};
