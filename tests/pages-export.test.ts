import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderIndex } from "@/lib/pages-html";
import { assertPagesSnapshot, pagesBase, pagesDigestMarkdown, toPagesRecord } from "@/lib/pages-public";
import { openDatabase } from "@/lib/db";
import { getEntry, ingestCandidate, saveEditorial, transitionEntry } from "@/lib/entries";
import { exportPagesFromSnapshot } from "@/lib/pages-export";
import type { SourceCandidate } from "@/lib/types";

const published = {
  id: "reviewed1",
  type: "paper",
  title: "Reviewed fixture title <script>alert(1)</script>",
  topics: ["evaluation"],
  publisher: "Fixture press",
  authors: ["A Person"],
  canonicalUrl: "https://example.com/papers/reviewed",
  stableId: "manual:reviewed1",
  versionLabel: null,
  publishedAt: "2026-11-01T00:00:00.000Z",
  updatedAt: null,
  fetchedAt: "2026-11-08T00:00:00.000Z",
  reviewedAt: "2026-11-08T01:00:00.000Z",
  datePrecision: "datetime",
  factSummary: "This reviewed summary states only the title, the date, and the primary URL that an editor checked.",
  interpretation: "An editor wrote this interpretation.",
  engineeringRelevance: "",
  caveats: "",
  licenseNote: "Manual citation.",
  citations: [{ label: "Primary", url: "https://example.com/papers/reviewed", role: "primary" }],
  sourceDrift: false,
  adapterId: "manual",
  sourceLabel: null,
};

describe("pages snapshot", () => {
  it("rejects drafts, fixtures, excerpts, and tokens", () => {
    expect(() => assertPagesSnapshot({ records: [{ ...published, status: "draft" }] })).toThrow(/published/i);
    expect(() => assertPagesSnapshot({ records: [{ ...published, origin: "fixture" }] })).toThrow(/origin/);
    expect(() => assertPagesSnapshot({ records: [{ ...published, sourceExcerpt: "raw abstract" }] })).toThrow(/sourceExcerpt/);
    expect(() => assertPagesSnapshot({ records: [{ ...published, reviewNote: "private note" }] })).toThrow(/reviewNote/);
    expect(() => assertPagesSnapshot({ records: [{ ...published, token: "secret" }] })).toThrow(/token/);
    const records = assertPagesSnapshot({ records: [published] });
    expect(records).toHaveLength(1);
    expect(JSON.stringify(records[0])).not.toContain("raw abstract");
  });

  it("escapes titles and honors the project base path", () => {
    expect(pagesBase("/quay-ai-digest")).toBe("/quay-ai-digest");
    expect(() => pagesBase("/quay/../secret")).toThrow(/QUAY_PAGES_BASE/);
    const html = renderIndex("/quay-ai-digest", assertPagesSnapshot({ records: [published] }));
    expect(html).toContain('href="/quay-ai-digest/"');
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("/quay-ai-digest/assets/desk.css");
    expect(html).toContain("/quay-ai-digest/items/reviewed1/");
  });

  it("writes only the approved snapshot and omits private fields", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quay-pages-"));
    const snapshot = path.join(dir, "published.json");
    fs.writeFileSync(snapshot, JSON.stringify({ records: [published] }));
    const out = path.join(dir, "dist");
    exportPagesFromSnapshot({ snapshotPath: snapshot, outDir: out, base: "/quay-ai-digest" });
    const index = fs.readFileSync(path.join(out, "index.html"), "utf8");
    const detail = fs.readFileSync(path.join(out, "items", "reviewed1", "index.html"), "utf8");
    const raw = fs.readFileSync(path.join(out, "snapshot.json"), "utf8");
    expect(index).toContain("Reviewed fixture title");
    expect(detail).not.toContain("sourceRequestUrl");
    expect(raw).not.toContain("reviewNote");
    expect(fs.existsSync(path.join(out, ".nojekyll"))).toBe(true);
    expect(pagesDigestMarkdown(assertPagesSnapshot({ records: [published] }), "2026-11-08T00:00:00.000Z")).toContain("https://example.com/papers/reviewed");
  });

  it("does not copy a fixture or a draft out of the database", () => {
    const db = openDatabase(":memory:");
    const now = "2026-11-08T00:00:00.000Z";
    const draft = ingestCandidate(db, candidate("https://example.com/draft", "Draft must stay off the snapshot"), now);
    expect(toPagesRecord(getEntry(db, draft.id)!)).toBeNull();
    const ready = ingestCandidate(db, candidate("https://example.com/ready", "Reviewed manual record"), now);
    saveEditorial(
      db,
      ready.id,
      {
        factSummary: "The editor checked this title against the primary URL and recorded that check in this summary.",
        interpretation: "Local interpretation.",
      },
      now,
    );
    transitionEntry(db, ready.id, "publish", { note: "Checked the primary URL.", confirmReviewed: true, now });
    const fixture = ingestCandidate(db, candidate("https://example.com/fixture-only", "Fixture must stay off the snapshot"), now);
    db.prepare("UPDATE entries SET origin = 'fixture', status = 'published' WHERE id = ?").run(fixture.id);
    const live = getEntry(db, ready.id)!;
    expect(toPagesRecord(live)?.title).toBe("Reviewed manual record");
    expect(toPagesRecord(getEntry(db, fixture.id)!)).toBeNull();
    expect(JSON.stringify(toPagesRecord(live))).not.toContain("Checked the primary URL");
    expect(JSON.stringify(toPagesRecord(live))).not.toContain("sourceExcerpt");
  });
});

function candidate(url: string, title: string): SourceCandidate {
  return {
    origin: "live",
    type: "news",
    title,
    canonicalUrl: url,
    stableId: `manual:${url}`,
    baseId: null,
    versionLabel: null,
    publisher: "Example",
    authors: ["Editor"],
    topics: ["systems"],
    publishedAt: "2026-11-01T00:00:00.000Z",
    updatedAt: null,
    datePrecision: "date",
    publishedRaw: "2026-11-01",
    updatedRaw: null,
    sourceExcerpt: "PRIVATE EXCERPT",
    excerptLicense: "private",
    sourceLabel: null,
    adapterId: "manual",
    sourceRequestUrl: "https://example.com/private-request",
    citations: [{ label: "Primary", url, role: "primary" }],
    factSummary: "Mechanical summary that is replaced before publication and is long enough for the editor gate.",
    factSummaryKind: "mechanical",
    licenseNote: "Manual citation.",
  };
}
