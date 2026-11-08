import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db";
import {
  getEntry,
  ingestCandidate,
  isPublicEntry,
  listEvents,
  listPublic,
  saveEditorial,
  transitionEntry,
} from "@/lib/entries";
import { renderDigest } from "@/lib/export-doc";
import type { SourceCandidate } from "@/lib/types";

const NOW = "2026-11-08T12:00:00.000Z";

function paper(overrides: Partial<SourceCandidate> = {}): SourceCandidate {
  return {
    origin: "fixture",
    type: "paper",
    title: "FIXTURE sparse attention kernels for local desks",
    canonicalUrl: "https://arxiv.org/abs/0000.00001v1",
    stableId: "arxiv:0000.00001v1",
    baseId: "arxiv:0000.00001",
    versionLabel: "v1",
    publisher: "arXiv",
    authors: ["Fixture Author"],
    topics: ["machine-learning"],
    publishedAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    datePrecision: "datetime",
    publishedRaw: "2026-11-01T00:00:00Z",
    updatedRaw: "2026-11-01T00:00:00Z",
    sourceExcerpt: "FIXTURE ABSTRACT NOT A REAL PAPER",
    excerptLicense: "fixture",
    sourceLabel: null,
    adapterId: "fixture",
    sourceRequestUrl: null,
    citations: [{ label: "arXiv abstract page", url: "https://arxiv.org/abs/0000.00001v1", role: "primary" }],
    factSummary: "Mechanical fixture summary that only restates the id 0000.00001v1.",
    factSummaryKind: "mechanical",
    licenseNote: "Fixture license note.",
    ...overrides,
  };
}

describe("deduplication", () => {
  it("is idempotent for the same stable id and canonical URL", () => {
    const db = openDatabase(":memory:");
    const first = ingestCandidate(db, paper(), NOW);
    const second = ingestCandidate(db, paper({ canonicalUrl: "https://arxiv.org/abs/0000.00001v1?utm_source=test" }), NOW);
    expect(first.id).toBe(second.id);
    expect(second.kind).toBe("unchanged");
    const rows = db.prepare("SELECT COUNT(*) AS count FROM entries").get() as { count: number };
    expect(rows.count).toBe(1);
    const events = listEvents(db, first.id).map((event) => event.action);
    expect(events).toContain("drafted");
    expect(events.filter((action) => action === "reingest-unchanged")).toHaveLength(1);
    expect(getEntry(db, first.id)?.status).toBe("draft");
  });

  it("keeps a new version instead of overwriting the previous one", () => {
    const db = openDatabase(":memory:");
    const v1 = ingestCandidate(db, paper(), NOW);
    const v2 = ingestCandidate(
      db,
      paper({
        title: "FIXTURE sparse attention kernels for local desks",
        canonicalUrl: "https://arxiv.org/abs/0000.00001v2",
        stableId: "arxiv:0000.00001v2",
        versionLabel: "v2",
        citations: [{ label: "arXiv abstract page", url: "https://arxiv.org/abs/0000.00001v2", role: "primary" }],
      }),
      NOW,
    );
    expect(v1.id).not.toBe(v2.id);
    expect(getEntry(db, v1.id)?.relatedIds).toContain(v2.id);
    expect(getEntry(db, v2.id)?.relatedIds).toContain(v1.id);
    expect(getEntry(db, v1.id)?.similarity).toEqual([]);
  });

  it("flags similar titles and does not merge them", () => {
    const db = openDatabase(":memory:");
    const first = ingestCandidate(db, paper(), NOW);
    const second = ingestCandidate(
      db,
      paper({
        title: "FIXTURE sparse attention kernels for local desks revised",
        canonicalUrl: "https://example.test/fixture/similar",
        stableId: "fixture:similar",
        baseId: null,
        versionLabel: null,
        citations: [{ label: "Fixture page", url: "https://example.test/fixture/similar", role: "primary" }],
      }),
      NOW,
    );
    expect(getEntry(db, second.id)?.similarity.some((flag) => flag.otherId === first.id)).toBe(true);
    expect(getEntry(db, first.id)?.status).toBe("draft");
    expect(getEntry(db, second.id)?.status).toBe("draft");
  });

  it("does not clobber an editorial summary on re-ingest", () => {
    const db = openDatabase(":memory:");
    const created = ingestCandidate(db, paper({ origin: "live", adapterId: "arxiv" }), NOW);
    saveEditorial(
      db,
      created.id,
      { factSummary: "Editor checked the id, the UTC timestamp, and the abstract page URL. The abstract is not restated." },
      NOW,
    );
    const again = ingestCandidate(
      db,
      paper({
        origin: "live",
        adapterId: "arxiv",
        factSummary: "A different mechanical sentence that should not replace the editor.",
        sourceExcerpt: "CHANGED FIXTURE ABSTRACT",
      }),
      NOW,
    );
    expect(again.kind).toBe("drift");
    const entry = getEntry(db, created.id);
    expect(entry?.factSummary).toContain("Editor checked");
    expect(entry?.sourceExcerpt).toBe("FIXTURE ABSTRACT NOT A REAL PAPER");
    expect(entry?.sourceDrift).toBe(true);
  });
});

describe("editorial exclusion and export", () => {
  it("hides drafts, rejected records, and fixtures from the public log and the digest", () => {
    const db = openDatabase(":memory:");
    const draft = ingestCandidate(db, paper({ origin: "live", adapterId: "arxiv" }), NOW);
    const rejected = ingestCandidate(
      db,
      paper({
        origin: "live",
        adapterId: "arxiv",
        title: "FIXTURE rejected routing note for desks",
        canonicalUrl: "https://arxiv.org/abs/0000.00002v1",
        stableId: "arxiv:0000.00002v1",
        baseId: "arxiv:0000.00002",
        citations: [{ label: "arXiv abstract page", url: "https://arxiv.org/abs/0000.00002v1", role: "primary" }],
      }),
      NOW,
    );
    const published = ingestCandidate(
      db,
      paper({
        origin: "live",
        adapterId: "arxiv",
        title: "FIXTURE published ledger note",
        canonicalUrl: "https://arxiv.org/abs/0000.00003v1",
        stableId: "arxiv:0000.00003v1",
        baseId: "arxiv:0000.00003",
        citations: [{ label: "arXiv abstract page", url: "https://arxiv.org/abs/0000.00003v1", role: "primary" }],
        sourceExcerpt: "DO NOT EXPORT THIS ABSTRACT",
      }),
      NOW,
    );
    const fixture = ingestCandidate(db, paper({
      title: "FIXTURE should stay out even if marked published",
      canonicalUrl: "https://example.test/fixture/hidden",
      stableId: "fixture:hidden",
      baseId: null,
      citations: [{ label: "Fixture", url: "https://example.test/fixture/hidden", role: "primary" }],
    }), NOW);

    expect(() => transitionEntry(db, published.id, "publish", { note: "Checked the fixture citation and date.", confirmReviewed: true, now: NOW })).toThrow(/factual summary/i);
    saveEditorial(db, published.id, {
      factSummary: "The fixture record 0000.00003v1 is used to test publication. Its publication timestamp is 2026-11-01T00:00:00.000Z.",
      interpretation: "Included only so the export test can show an interpretation section.",
    }, NOW);
    expect(() => transitionEntry(db, published.id, "publish", { note: "short", confirmReviewed: true, now: NOW })).toThrow(/review note/i);
    const live = transitionEntry(db, published.id, "publish", {
      note: "Checked the fixture citation and date.",
      confirmReviewed: true,
      now: NOW,
    });
    transitionEntry(db, rejected.id, "reject", { note: "Rejected during the test.", now: NOW });
    db.prepare("UPDATE entries SET status = 'published', origin = 'fixture' WHERE id = ?").run(fixture.id);

    expect(live.status).toBe("published");
    const publicEntries = listPublic(db);
    expect(publicEntries.map((entry) => entry.id)).toEqual([live.id]);
    expect(isPublicEntry(getEntry(db, draft.id)!)).toBe(false);
    expect(isPublicEntry(getEntry(db, rejected.id)!)).toBe(false);
    expect(isPublicEntry(getEntry(db, fixture.id)!)).toBe(false);

    const digest = renderDigest(listPublic(db).concat([getEntry(db, draft.id)!, getEntry(db, rejected.id)!, getEntry(db, fixture.id)!]), [draft.id, rejected.id, fixture.id, live.id, "missing-id"], NOW);
    expect(digest.included.map((entry) => entry.id)).toEqual([live.id]);
    expect(digest.omitted.map((item) => item.id).sort()).toEqual([draft.id, fixture.id, "missing-id", rejected.id].sort());
    expect(digest.markdown).toContain("Facts");
    expect(digest.markdown).toContain("Interpretation");
    expect(digest.markdown).toContain("https://arxiv.org/abs/0000.00003v1");
    expect(digest.markdown).not.toContain("DO NOT EXPORT THIS ABSTRACT");
    expect(digest.markdown).not.toContain("FIXTURE rejected routing note");
    expect(digest.html).not.toContain("DO NOT EXPORT THIS ABSTRACT");
  });

  it("escapes HTML in exported titles", () => {
    const db = openDatabase(":memory:");
    const created = ingestCandidate(db, paper({
      origin: "live",
      title: "FIXTURE <script>alert(1)</script>",
      canonicalUrl: "https://arxiv.org/abs/0000.00004v1",
      stableId: "arxiv:0000.00004v1",
      baseId: "arxiv:0000.00004",
      citations: [{ label: "arXiv abstract page", url: "https://arxiv.org/abs/0000.00004v1", role: "primary" }],
    }), NOW);
    saveEditorial(db, created.id, {
      factSummary: "Facts mention the id 0000.00004v1 and do not include markup from the title test.",
    }, NOW);
    transitionEntry(db, created.id, "publish", { note: "Checked the escaped title.", confirmReviewed: true, now: NOW });
    const entry = getEntry(db, created.id)!;
    const digest = renderDigest([entry], [entry.id], NOW);
    expect(digest.html).toContain("&lt;script&gt;");
    expect(digest.html).not.toContain("<script>alert");
  });

  it("refuses to publish a fixture or a mechanical summary", () => {
    const db = openDatabase(":memory:");
    const created = ingestCandidate(db, paper(), NOW);
    expect(() => transitionEntry(db, created.id, "publish", { note: "Checked fixture rules.", confirmReviewed: true, now: NOW })).toThrow(/Fixture/);
  });
});
