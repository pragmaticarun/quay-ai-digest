import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../src/lib/db";
import { ingestCandidate } from "../src/lib/entries";
import type { SourceCandidate } from "../src/lib/types";
import { DRAFT_TITLE, FIXTURE_TITLE } from "./titles";

const marker = path.join(process.cwd(), "e2e", ".isolated-db-path");
const NOW = "2026-11-08T12:00:00.000Z";

function candidate(title: string, origin: "fixture" | "live", slug: string): SourceCandidate {
  return {
    origin,
    type: "paper",
    title,
    canonicalUrl: `https://example.com/quay-e2e-${slug}`,
    stableId: `e2e:${slug}`,
    baseId: `e2e:${slug}`,
    versionLabel: null,
    publisher: "E2E fixture publisher",
    authors: ["Fixture Author"],
    topics: ["e2e-fixture"],
    publishedAt: NOW,
    updatedAt: NOW,
    datePrecision: "datetime",
    publishedRaw: NOW,
    updatedRaw: NOW,
    sourceExcerpt: "E2E source text. Not a real paper.",
    excerptLicense: "fixture",
    sourceLabel: null,
    adapterId: "fixture",
    sourceRequestUrl: null,
    citations: [{ label: "Example citation", url: `https://example.com/quay-e2e-${slug}`, role: "primary" }],
    factSummary: "E2E mechanical summary. This row is a test fixture.",
    factSummaryKind: "mechanical",
    licenseNote: "Test fixture. Not a published source.",
  };
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quay-e2e-"));
const dbPath = path.join(dir, "desk.sqlite");
const db = openDatabase(dbPath);
ingestCandidate(db, candidate(DRAFT_TITLE, "live", "draft"), NOW);
ingestCandidate(db, candidate(FIXTURE_TITLE, "fixture", "fixture"), NOW);
db.prepare("UPDATE entries SET status = 'published', reviewed_at = ? WHERE stable_id = 'e2e:fixture'").run(NOW);
db.close();
fs.writeFileSync(marker, `${dbPath}\n`);
