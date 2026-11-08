import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { parseSourceDate } from "@/lib/dates";
import { EditorError } from "@/lib/errors";
import { jaccard, SIMILARITY_THRESHOLD, titleTokens } from "@/lib/similarity";
import type {
  Citation,
  DatePrecision,
  Entry,
  EntryType,
  FactKind,
  IngestRun,
  Origin,
  PendingSource,
  PublicQuery,
  ReviewEvent,
  ReviewStatus,
  SimilarityFlag,
  SourceCandidate,
} from "@/lib/types";
import { ENTRY_TYPES } from "@/lib/types";
import { isIsoDay } from "@/lib/dates";
import { normalizeCanonicalUrl } from "@/lib/urls";

type Row = Record<string, unknown>;

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length ? value : null;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function rowToEntry(row: Row): Entry {
  return {
    id: text(row.id),
    origin: text(row.origin) as Origin,
    status: text(row.status) as ReviewStatus,
    type: text(row.type) as EntryType,
    title: text(row.title),
    canonicalUrl: text(row.canonical_url),
    stableId: text(row.stable_id),
    baseId: textOrNull(row.base_id),
    versionLabel: textOrNull(row.version_label),
    publisher: textOrNull(row.publisher),
    authors: parseJson<string[]>(row.authors_json, []),
    topics: parseJson<string[]>(row.topics_json, []),
    publishedAt: textOrNull(row.published_at),
    updatedAt: textOrNull(row.updated_at),
    fetchedAt: text(row.fetched_at),
    lastSeenAt: text(row.last_seen_at),
    datePrecision: text(row.date_precision) as DatePrecision,
    publishedRaw: textOrNull(row.published_raw),
    updatedRaw: textOrNull(row.updated_raw),
    factSummary: text(row.fact_summary),
    factSummaryKind: text(row.fact_summary_kind) as FactKind,
    interpretation: text(row.interpretation),
    engineeringRelevance: text(row.engineering_relevance),
    caveats: text(row.caveats),
    licenseNote: text(row.license_note),
    sourceExcerpt: textOrNull(row.source_excerpt),
    excerptLicense: textOrNull(row.excerpt_license),
    sourceLabel: textOrNull(row.source_label),
    adapterId: text(row.adapter_id),
    sourceRequestUrl: textOrNull(row.source_request_url),
    citations: parseJson<Citation[]>(row.citations_json, []),
    contentHash: text(row.content_hash),
    sourceDrift: Number(row.source_drift) === 1,
    pendingSource: parseJson<PendingSource | null>(row.pending_source_json, null),
    duplicateOf: textOrNull(row.duplicate_of),
    similarity: parseJson<SimilarityFlag[]>(row.similarity_json, []),
    relatedIds: parseJson<string[]>(row.related_json, []),
    reviewNote: text(row.review_note),
    createdAt: text(row.created_at),
    reviewedAt: textOrNull(row.reviewed_at),
  };
}

export function sourceHash(candidate: Pick<
  SourceCandidate,
  | "title"
  | "canonicalUrl"
  | "stableId"
  | "authors"
  | "publishedAt"
  | "updatedAt"
  | "sourceExcerpt"
  | "sourceLabel"
  | "topics"
  | "citations"
  | "versionLabel"
  | "factSummary"
>): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: candidate.title,
        canonicalUrl: candidate.canonicalUrl,
        stableId: candidate.stableId,
        authors: candidate.authors,
        publishedAt: candidate.publishedAt,
        updatedAt: candidate.updatedAt,
        sourceExcerpt: candidate.sourceExcerpt,
        sourceLabel: candidate.sourceLabel,
        topics: candidate.topics,
        citations: candidate.citations,
        versionLabel: candidate.versionLabel,
        factSummary: candidate.factSummary,
      }),
    )
    .digest("hex");
}

export function listEntries(db: DatabaseSync): Entry[] {
  const rows = db.prepare("SELECT * FROM entries ORDER BY created_at DESC, title ASC").all() as Row[];
  return rows.map(rowToEntry);
}

export function getEntry(db: DatabaseSync, id: string): Entry | null {
  const row = db.prepare("SELECT * FROM entries WHERE id = ?").get(id) as Row | undefined;
  return row ? rowToEntry(row) : null;
}

export function listEvents(db: DatabaseSync, entryId: string): ReviewEvent[] {
  const rows = db
    .prepare("SELECT * FROM review_events WHERE entry_id = ? ORDER BY id ASC")
    .all(entryId) as Row[];
  return rows.map((row) => ({
    id: Number(row.id),
    entryId: text(row.entry_id),
    at: text(row.at),
    action: text(row.action),
    note: text(row.note),
  }));
}

function addEvent(db: DatabaseSync, entryId: string, at: string, action: string, note: string) {
  db.prepare("INSERT INTO review_events(entry_id, at, action, note) VALUES(?, ?, ?, ?)").run(
    entryId,
    at,
    action,
    note,
  );
}

function findByStable(db: DatabaseSync, stableId: string): Entry | null {
  const row = db.prepare("SELECT * FROM entries WHERE stable_id = ?").get(stableId) as Row | undefined;
  return row ? rowToEntry(row) : null;
}

function findByCanonical(db: DatabaseSync, canonicalUrl: string): Entry | null {
  const row = db.prepare("SELECT * FROM entries WHERE canonical_url = ?").get(canonicalUrl) as Row | undefined;
  return row ? rowToEntry(row) : null;
}

function relinkBase(db: DatabaseSync, baseId: string | null) {
  if (!baseId) return;
  const rows = db.prepare("SELECT id FROM entries WHERE base_id = ?").all(baseId) as { id: string }[];
  const ids = rows.map((row) => row.id);
  for (const id of ids) {
    const related = ids.filter((other) => other !== id);
    db.prepare("UPDATE entries SET related_json = ? WHERE id = ?").run(JSON.stringify(related), id);
  }
}

function recomputeSimilarity(db: DatabaseSync, entryId: string) {
  const current = getEntry(db, entryId);
  if (!current) return;
  const others = listEntries(db).filter((entry) => entry.id !== current.id);
  const flags: SimilarityFlag[] = [];
  const currentTokens = titleTokens(current.title);
  for (const other of others) {
    if (current.baseId && other.baseId === current.baseId) {
      const remaining = other.similarity.filter((flag) => flag.otherId !== current.id);
      if (remaining.length !== other.similarity.length) {
        db.prepare("UPDATE entries SET similarity_json = ? WHERE id = ?").run(JSON.stringify(remaining), other.id);
      }
      continue;
    }
    const score = jaccard(currentTokens, titleTokens(other.title));
    const rounded = Math.round(score * 100) / 100;
    const existingOther = other.similarity.filter((flag) => flag.otherId !== current.id);
    if (score >= SIMILARITY_THRESHOLD) {
      flags.push({ otherId: other.id, score: rounded, reason: "title-token-overlap" });
      existingOther.push({ otherId: current.id, score: rounded, reason: "title-token-overlap" });
    }
    db.prepare("UPDATE entries SET similarity_json = ? WHERE id = ?").run(JSON.stringify(existingOther), other.id);
  }
  db.prepare("UPDATE entries SET similarity_json = ? WHERE id = ?").run(JSON.stringify(flags), current.id);
}

export type IngestEffect = {
  kind: "created" | "unchanged" | "updated" | "drift" | "conflict";
  id: string;
};

function pendingFrom(candidate: SourceCandidate, canonicalUrl: string, hash: string): PendingSource {
  return {
    title: candidate.title,
    canonicalUrl,
    publishedAt: candidate.publishedAt,
    updatedAt: candidate.updatedAt,
    datePrecision: candidate.datePrecision,
    publishedRaw: candidate.publishedRaw,
    updatedRaw: candidate.updatedRaw,
    authors: candidate.authors,
    sourceExcerpt: candidate.sourceExcerpt,
    sourceLabel: candidate.sourceLabel,
    contentHash: hash,
    versionLabel: candidate.versionLabel,
    citations: candidate.citations,
  };
}

export function ingestCandidate(db: DatabaseSync, candidate: SourceCandidate, now: string): IngestEffect {
  const canonicalUrl = normalizeCanonicalUrl(candidate.canonicalUrl);
  if (!canonicalUrl) throw new EditorError("url", "Candidate canonical URL is not an allowed http(s) URL.");
  const stored: SourceCandidate = { ...candidate, canonicalUrl };
  const hash = sourceHash(stored);
  const byStable = findByStable(db, stored.stableId);
  const byUrl = findByCanonical(db, canonicalUrl);
  if (byUrl && byUrl.stableId !== stored.stableId) {
    addEvent(
      db,
      byUrl.id,
      now,
      "dedup-conflict",
      `Incoming stable id ${stored.stableId} uses a canonical URL already stored as ${byUrl.stableId}. The incoming record was not inserted.`,
    );
    return { kind: "conflict", id: byUrl.id };
  }
  const existing = byStable ?? byUrl;
  if (!existing) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO entries (
        id, origin, status, type, title, canonical_url, stable_id, base_id, version_label, publisher,
        authors_json, topics_json, published_at, updated_at, fetched_at, last_seen_at, date_precision,
        published_raw, updated_raw, fact_summary, fact_summary_kind, interpretation, engineering_relevance,
        caveats, license_note, source_excerpt, excerpt_license, source_label, adapter_id, source_request_url,
        citations_json, content_hash, source_drift, pending_source_json, duplicate_of, similarity_json,
        related_json, review_note, created_at, reviewed_at
      ) VALUES (
        ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, 0, NULL, NULL, '[]',
        '[]', '', ?, NULL
      )`,
    ).run(
      id,
      stored.origin,
      stored.type,
      stored.title,
      canonicalUrl,
      stored.stableId,
      stored.baseId,
      stored.versionLabel,
      stored.publisher,
      JSON.stringify(stored.authors),
      JSON.stringify(stored.topics),
      stored.publishedAt,
      stored.updatedAt,
      now,
      now,
      stored.datePrecision,
      stored.publishedRaw,
      stored.updatedRaw,
      stored.factSummary,
      stored.factSummaryKind,
      stored.interpretation ?? "",
      stored.engineeringRelevance ?? "",
      stored.caveats ?? "",
      stored.licenseNote,
      stored.sourceExcerpt,
      stored.excerptLicense,
      stored.sourceLabel,
      stored.adapterId,
      stored.sourceRequestUrl,
      JSON.stringify(stored.citations),
      hash,
      now,
    );
    addEvent(db, id, now, "fetched", "Record stored from the source response.");
    addEvent(db, id, now, "normalized", `Canonical URL ${canonicalUrl}. Stable id ${stored.stableId}.`);
    relinkBase(db, stored.baseId);
    recomputeSimilarity(db, id);
    const created = getEntry(db, id);
    const flagNote = created?.similarity.length
      ? `Title similarity flagged against ${created.similarity.length} other record(s). Nothing was merged.`
      : "No canonical-url or stable-id duplicate. Related versions, if any, stay as separate records.";
    addEvent(db, id, now, "dedup-checked", flagNote);
    addEvent(db, id, now, "drafted", "Held as a draft. Ingestion does not publish.");
    return { kind: "created", id };
  }

  db.prepare("UPDATE entries SET last_seen_at = ? WHERE id = ?").run(now, existing.id);
  const mergedTopics = [...existing.topics];
  for (const topic of stored.topics) {
    if (!mergedTopics.includes(topic)) mergedTopics.push(topic);
  }
  const merged: SourceCandidate = { ...stored, topics: mergedTopics };
  const mergedHash = sourceHash(merged);
  if (existing.contentHash === mergedHash && existing.canonicalUrl === canonicalUrl) {
    addEvent(db, existing.id, now, "reingest-unchanged", "Same source hash. Editorial fields were left as they were.");
    return { kind: "unchanged", id: existing.id };
  }

  const locked =
    existing.factSummaryKind === "editor" ||
    existing.status === "published" ||
    existing.status === "rejected" ||
    existing.status === "in_review";
  if (locked) {
    db.prepare("UPDATE entries SET source_drift = 1, pending_source_json = ? WHERE id = ?").run(
      JSON.stringify(pendingFrom(merged, canonicalUrl, mergedHash)),
      existing.id,
    );
    addEvent(
      db,
      existing.id,
      now,
      "source-drift",
      "Source metadata changed after editorial work. Displayed text was not rewritten. A pending source snapshot is waiting for an editor.",
    );
    return { kind: "drift", id: existing.id };
  }

  db.prepare(
    `UPDATE entries SET
      title = ?, canonical_url = ?, base_id = ?, version_label = ?, publisher = ?, authors_json = ?,
      topics_json = ?, published_at = ?, updated_at = ?, date_precision = ?, published_raw = ?, updated_raw = ?,
      fact_summary = ?, license_note = ?, source_excerpt = ?, excerpt_license = ?, source_label = ?,
      source_request_url = ?, citations_json = ?, content_hash = ?, source_drift = 0, pending_source_json = NULL
     WHERE id = ?`,
  ).run(
    merged.title,
    canonicalUrl,
    merged.baseId,
    merged.versionLabel,
    merged.publisher,
    JSON.stringify(merged.authors),
    JSON.stringify(merged.topics),
    merged.publishedAt,
    merged.updatedAt,
    merged.datePrecision,
    merged.publishedRaw,
    merged.updatedRaw,
    merged.factSummary,
    merged.licenseNote,
    merged.sourceExcerpt,
    merged.excerptLicense,
    merged.sourceLabel,
    merged.sourceRequestUrl,
    JSON.stringify(merged.citations),
    mergedHash,
    existing.id,
  );
  relinkBase(db, stored.baseId);
  recomputeSimilarity(db, existing.id);
  addEvent(db, existing.id, now, "source-updated", "Mechanical draft refreshed from a changed source response.");
  return { kind: "updated", id: existing.id };
}

export function isPublicEntry(entry: Entry): boolean {
  return entry.status === "published" && entry.origin !== "fixture";
}

export function matchesPublicQuery(entry: Entry, query: PublicQuery): boolean {
  if (!isPublicEntry(entry)) return false;
  if (query.type) {
    if (!ENTRY_TYPES.includes(query.type as EntryType) || entry.type !== query.type) return false;
  }
  if (query.topic) {
    if (!entry.topics.includes(query.topic)) return false;
  }
  if (query.from || query.to) {
    if (!entry.publishedAt) return false;
    if (query.from) {
      if (!isIsoDay(query.from)) return false;
      if (entry.publishedAt < `${query.from}T00:00:00.000Z`) return false;
    }
    if (query.to) {
      if (!isIsoDay(query.to)) return false;
      if (entry.publishedAt > `${query.to}T23:59:59.999Z`) return false;
    }
  }
  const q = query.q?.trim().toLowerCase();
  if (q) {
    const haystack = [entry.title, entry.factSummary, entry.interpretation, entry.publisher ?? "", entry.authors.join(" "), entry.topics.join(" "), entry.stableId]
      .join("\n")
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

export function listPublic(db: DatabaseSync, query: PublicQuery = {}): Entry[] {
  return listEntries(db)
    .filter((entry) => matchesPublicQuery(entry, query))
    .sort((a, b) => {
      const left = a.publishedAt ?? a.fetchedAt;
      const right = b.publishedAt ?? b.fetchedAt;
      if (left === right) return a.title.localeCompare(b.title);
      return right.localeCompare(left);
    });
}

export function getPublic(db: DatabaseSync, id: string): Entry | null {
  const entry = getEntry(db, id);
  if (!entry || !isPublicEntry(entry)) return null;
  return entry;
}

const TOPIC_PATTERN = /^[a-z0-9][a-z0-9-]{0,40}$/;

function cleanTopics(topics: string[]): string[] {
  const unique: string[] = [];
  for (const topic of topics) {
    const value = topic.trim().toLowerCase();
    if (!TOPIC_PATTERN.test(value)) {
      throw new EditorError("topic", `Topic "${topic}" must be a short lowercase slug.`);
    }
    if (!unique.includes(value)) unique.push(value);
  }
  if (unique.length > 8) throw new EditorError("topic", "Use at most 8 topics.");
  return unique;
}

function cleanCitations(citations: Citation[]): Citation[] {
  if (citations.length > 8) throw new EditorError("citation", "Use at most 8 citations.");
  const cleaned: Citation[] = [];
  for (const citation of citations) {
    const label = citation.label?.trim() ?? "";
    if (label.length < 2 || label.length > 160) throw new EditorError("citation", "Each citation needs a label.");
    const url = normalizeCanonicalUrl(citation.url ?? "");
    if (!url) throw new EditorError("citation", `Citation URL is not an allowed http(s) URL: ${citation.label}`);
    if (citation.role !== "primary" && citation.role !== "context") {
      throw new EditorError("citation", "Citation role must be primary or context.");
    }
    cleaned.push({ label, url, role: citation.role });
  }
  return cleaned;
}

export type EditorialPatch = {
  title?: string;
  type?: EntryType;
  topics?: string[];
  publisher?: string | null;
  authors?: string[];
  publishedAt?: string | null;
  factSummary?: string;
  interpretation?: string;
  engineeringRelevance?: string;
  caveats?: string;
  reviewNote?: string;
  citations?: Citation[];
};

export function saveEditorial(db: DatabaseSync, id: string, patch: EditorialPatch, now: string): Entry {
  const entry = getEntry(db, id);
  if (!entry) throw new EditorError("not_found", "No record with that id.", 404);
  if (entry.origin === "fixture") {
    throw new EditorError("fixture", "Fixture records stay labeled fixtures and cannot be edited into the public log.");
  }
  const next = { ...entry };
  const changed: string[] = [];
  const previous: string[] = [];

  if (patch.title !== undefined) {
    const title = patch.title.trim().replace(/\s+/g, " ");
    if (title.length < 8 || title.length > 300) throw new EditorError("title", "Title must be 8 to 300 characters.");
    if (title !== entry.title) {
      changed.push("title");
      previous.push(`Previous title: ${entry.title}`);
      next.title = title;
    }
  }
  if (patch.type !== undefined) {
    if (!ENTRY_TYPES.includes(patch.type)) throw new EditorError("type", "Unknown type.");
    if (patch.type !== entry.type) {
      changed.push("type");
      next.type = patch.type;
    }
  }
  if (patch.topics !== undefined) {
    next.topics = cleanTopics(patch.topics);
    changed.push("topics");
  }
  if (patch.publisher !== undefined) {
    const publisher = patch.publisher?.trim() || null;
    if (publisher && publisher.length > 200) throw new EditorError("publisher", "Publisher is too long.");
    next.publisher = publisher;
    changed.push("publisher");
  }
  if (patch.authors !== undefined) {
    if (patch.authors.length > 40) throw new EditorError("authors", "Store at most 40 authors.");
    next.authors = patch.authors.map((author) => author.trim()).filter(Boolean).map((author) => {
      if (author.length > 200) throw new EditorError("authors", "An author name is too long.");
      return author;
    });
    changed.push("authors");
  }
  if (patch.publishedAt !== undefined) {
    if (patch.publishedAt === null || patch.publishedAt.trim() === "") {
      next.publishedAt = null;
      next.datePrecision = "unknown";
      changed.push("publishedAt");
    } else {
      const parsed = parseSourceDate(patch.publishedAt);
      if (!parsed.iso) throw new EditorError("date", "Publication date could not be parsed. Leave it blank to mark the date unknown.");
      next.publishedAt = parsed.iso;
      next.datePrecision = parsed.precision;
      changed.push("publishedAt");
    }
  }
  if (patch.factSummary !== undefined) {
    const fact = patch.factSummary.trim();
    if (fact.length > 4000) throw new EditorError("summary", "Factual summary is too long.");
    next.factSummary = fact;
    next.factSummaryKind = "editor";
    changed.push("factSummary");
    previous.push(`Previous factual summary: ${entry.factSummary.slice(0, 2000)}`);
  }
  if (patch.interpretation !== undefined) {
    next.interpretation = patch.interpretation.trim().slice(0, 4000);
    changed.push("interpretation");
  }
  if (patch.engineeringRelevance !== undefined) {
    next.engineeringRelevance = patch.engineeringRelevance.trim().slice(0, 4000);
    changed.push("engineeringRelevance");
  }
  if (patch.caveats !== undefined) {
    next.caveats = patch.caveats.trim().slice(0, 4000);
    changed.push("caveats");
  }
  if (patch.reviewNote !== undefined) {
    next.reviewNote = patch.reviewNote.trim().slice(0, 2000);
    changed.push("reviewNote");
  }
  if (patch.citations !== undefined) {
    next.citations = cleanCitations(patch.citations);
    changed.push("citations");
  }

  db.prepare(
    `UPDATE entries SET
      title = ?, type = ?, topics_json = ?, publisher = ?, authors_json = ?, published_at = ?,
      date_precision = ?, fact_summary = ?, fact_summary_kind = ?, interpretation = ?,
      engineering_relevance = ?, caveats = ?, review_note = ?, citations_json = ?
     WHERE id = ?`,
  ).run(
    next.title,
    next.type,
    JSON.stringify(next.topics),
    next.publisher,
    JSON.stringify(next.authors),
    next.publishedAt,
    next.datePrecision,
    next.factSummary,
    next.factSummaryKind,
    next.interpretation,
    next.engineeringRelevance,
    next.caveats,
    next.reviewNote,
    JSON.stringify(next.citations),
    id,
  );
  if (patch.title && patch.title !== entry.title) recomputeSimilarity(db, id);
  addEvent(
    db,
    id,
    now,
    "editorial-edit",
    [`Updated fields: ${changed.join(", ") || "none"}.`, ...previous].join("\n").slice(0, 4000),
  );
  const saved = getEntry(db, id);
  if (!saved) throw new EditorError("not_found", "Record disappeared during save.", 500);
  return saved;
}

export type TransitionAction = "publish" | "reject" | "start_review" | "return_to_draft" | "apply_pending_source";

export function transitionEntry(
  db: DatabaseSync,
  id: string,
  action: TransitionAction,
  options: { note?: string; confirmReviewed?: boolean; now: string },
): Entry {
  const entry = getEntry(db, id);
  if (!entry) throw new EditorError("not_found", "No record with that id.", 404);
  const note = options.note?.trim() ?? "";

  if (action === "publish") {
    if (entry.origin === "fixture") throw new EditorError("fixture", "Fixture records cannot be published.");
    if (entry.status !== "draft" && entry.status !== "in_review") {
      throw new EditorError("status", "Only drafts and in-review records can be published.");
    }
    if (!options.confirmReviewed) {
      throw new EditorError("confirm", "Publishing requires the review confirmation.");
    }
    if (entry.factSummaryKind !== "editor" || entry.factSummary.trim().length < 40) {
      throw new EditorError("summary", "Save an editorial factual summary of at least 40 characters before publishing.");
    }
    if (!entry.citations.some((citation) => citation.role === "primary" && normalizeCanonicalUrl(citation.url))) {
      throw new EditorError("citation", "A primary citation with an http(s) URL is required.");
    }
    if (note.length < 8) throw new EditorError("note", "Add a review note of at least 8 characters.");
    db.prepare("UPDATE entries SET status = 'published', reviewed_at = ?, review_note = ? WHERE id = ?").run(
      options.now,
      note,
      id,
    );
    addEvent(db, id, options.now, "published", note);
  } else if (action === "reject") {
    if (entry.origin === "fixture") throw new EditorError("fixture", "Fixture records cannot enter the review workflow.");
    if (entry.status === "rejected") throw new EditorError("status", "This record is already rejected.");
    if (note.length < 8) throw new EditorError("note", "Rejecting requires a note of at least 8 characters.");
    db.prepare("UPDATE entries SET status = 'rejected', reviewed_at = ?, review_note = ? WHERE id = ?").run(
      options.now,
      note,
      id,
    );
    addEvent(db, id, options.now, "rejected", note);
  } else if (action === "start_review") {
    if (entry.status !== "draft") throw new EditorError("status", "Only a draft can be marked in review.");
    db.prepare("UPDATE entries SET status = 'in_review' WHERE id = ?").run(id);
    addEvent(db, id, options.now, "in_review", note || "Marked in review. Still unpublished.");
  } else if (action === "return_to_draft") {
    if (entry.status === "draft") throw new EditorError("status", "This record is already a draft.");
    if (note.length < 8) throw new EditorError("note", "Returning a record to draft requires a note.");
    db.prepare("UPDATE entries SET status = 'draft', review_note = ? WHERE id = ?").run(note, id);
    addEvent(db, id, options.now, "returned-to-draft", note);
  } else if (action === "apply_pending_source") {
    if (!entry.pendingSource) throw new EditorError("pending", "There is no pending source snapshot.");
    const pending = entry.pendingSource;
    const owner = findByCanonical(db, pending.canonicalUrl);
    if (owner && owner.id !== entry.id) {
      throw new EditorError("conflict", "The pending canonical URL belongs to another record. It was not applied.");
    }
    db.prepare(
      `UPDATE entries SET
        title = ?, canonical_url = ?, version_label = ?, published_at = ?, updated_at = ?, date_precision = ?,
        published_raw = ?, updated_raw = ?, authors_json = ?, source_excerpt = ?, source_label = ?,
        citations_json = ?, content_hash = ?, source_drift = 0, pending_source_json = NULL
       WHERE id = ?`,
    ).run(
      pending.title,
      pending.canonicalUrl,
      pending.versionLabel,
      pending.publishedAt,
      pending.updatedAt,
      pending.datePrecision,
      pending.publishedRaw,
      pending.updatedRaw,
      JSON.stringify(pending.authors),
      pending.sourceExcerpt,
      pending.sourceLabel,
      JSON.stringify(pending.citations),
      pending.contentHash,
      id,
    );
    recomputeSimilarity(db, id);
    addEvent(
      db,
      id,
      options.now,
      "pending-source-applied",
      note || "Editor applied the pending source snapshot. Fact and interpretation text were not rewritten by this action.",
    );
  }

  const updated = getEntry(db, id);
  if (!updated) throw new EditorError("not_found", "Record disappeared during transition.", 500);
  return updated;
}

export function countPublishedByType(entries: Entry[]): Record<EntryType | "all", number> {
  const counts: Record<EntryType | "all", number> = {
    all: 0,
    news: 0,
    model: 0,
    paper: 0,
    repo: 0,
    tool: 0,
  };
  for (const entry of entries) {
    if (!isPublicEntry(entry)) continue;
    counts.all += 1;
    counts[entry.type] += 1;
  }
  return counts;
}

export function publishedTopics(entries: Entry[]): string[] {
  const topics = new Set<string>();
  for (const entry of entries) {
    if (!isPublicEntry(entry)) continue;
    for (const topic of entry.topics) topics.add(topic);
  }
  return [...topics].sort();
}

function rowToRun(row: Row): IngestRun {
  return {
    id: text(row.id),
    adapterId: text(row.adapter_id),
    startedAt: text(row.started_at),
    finishedAt: textOrNull(row.finished_at),
    outcome: text(row.outcome) as IngestRun["outcome"],
    httpStatus: row.http_status == null ? null : Number(row.http_status),
    message: text(row.message),
    fetchedCount: Number(row.fetched_count ?? 0),
    createdCount: Number(row.created_count ?? 0),
    unchangedCount: Number(row.unchanged_count ?? 0),
    updatedCount: Number(row.updated_count ?? 0),
    driftCount: Number(row.drift_count ?? 0),
    conflictCount: Number(row.conflict_count ?? 0),
    skippedCount: Number(row.skipped_count ?? 0),
  };
}

export function insertRun(db: DatabaseSync, run: IngestRun) {
  db.prepare(
    `INSERT INTO ingest_runs (
      id, adapter_id, started_at, finished_at, outcome, http_status, message,
      fetched_count, created_count, unchanged_count, updated_count, drift_count, conflict_count, skipped_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    run.id,
    run.adapterId,
    run.startedAt,
    run.finishedAt,
    run.outcome,
    run.httpStatus,
    run.message,
    run.fetchedCount,
    run.createdCount,
    run.unchangedCount,
    run.updatedCount,
    run.driftCount,
    run.conflictCount,
    run.skippedCount,
  );
}

export function updateRun(db: DatabaseSync, run: IngestRun) {
  db.prepare(
    `UPDATE ingest_runs SET
      finished_at = ?, outcome = ?, http_status = ?, message = ?, fetched_count = ?, created_count = ?,
      unchanged_count = ?, updated_count = ?, drift_count = ?, conflict_count = ?, skipped_count = ?
     WHERE id = ?`,
  ).run(
    run.finishedAt,
    run.outcome,
    run.httpStatus,
    run.message,
    run.fetchedCount,
    run.createdCount,
    run.unchangedCount,
    run.updatedCount,
    run.driftCount,
    run.conflictCount,
    run.skippedCount,
    run.id,
  );
}

export function listRuns(db: DatabaseSync, limit = 20): IngestRun[] {
  const rows = db.prepare("SELECT * FROM ingest_runs ORDER BY started_at DESC LIMIT ?").all(limit) as Row[];
  return rows.map(rowToRun);
}

export function getAdapterRuntime(db: DatabaseSync, adapterId: string): { lastRequestAt: string | null; lastSuccessAt: string | null } {
  const row = db.prepare("SELECT * FROM adapter_runtime WHERE adapter_id = ?").get(adapterId) as Row | undefined;
  return {
    lastRequestAt: row ? textOrNull(row.last_request_at) : null,
    lastSuccessAt: row ? textOrNull(row.last_success_at) : null,
  };
}

export function markAdapterRequest(db: DatabaseSync, adapterId: string, at: string) {
  db.prepare(
    `INSERT INTO adapter_runtime(adapter_id, last_request_at, last_success_at)
     VALUES(?, ?, NULL)
     ON CONFLICT(adapter_id) DO UPDATE SET last_request_at = excluded.last_request_at`,
  ).run(adapterId, at);
}

export function markAdapterSuccess(db: DatabaseSync, adapterId: string, at: string) {
  db.prepare(
    `INSERT INTO adapter_runtime(adapter_id, last_request_at, last_success_at)
     VALUES(?, ?, ?)
     ON CONFLICT(adapter_id) DO UPDATE SET last_success_at = excluded.last_success_at`,
  ).run(adapterId, at, at);
}
