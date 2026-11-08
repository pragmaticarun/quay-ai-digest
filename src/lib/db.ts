import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  status TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  canonical_url TEXT NOT NULL UNIQUE,
  stable_id TEXT NOT NULL UNIQUE,
  base_id TEXT,
  version_label TEXT,
  publisher TEXT,
  authors_json TEXT NOT NULL,
  topics_json TEXT NOT NULL,
  published_at TEXT,
  updated_at TEXT,
  fetched_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  date_precision TEXT NOT NULL,
  published_raw TEXT,
  updated_raw TEXT,
  fact_summary TEXT NOT NULL,
  fact_summary_kind TEXT NOT NULL,
  interpretation TEXT NOT NULL,
  engineering_relevance TEXT NOT NULL,
  caveats TEXT NOT NULL,
  license_note TEXT NOT NULL,
  source_excerpt TEXT,
  excerpt_license TEXT,
  source_label TEXT,
  adapter_id TEXT NOT NULL,
  source_request_url TEXT,
  citations_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  source_drift INTEGER NOT NULL DEFAULT 0,
  pending_source_json TEXT,
  duplicate_of TEXT,
  similarity_json TEXT NOT NULL,
  related_json TEXT NOT NULL,
  review_note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS review_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id TEXT NOT NULL,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  note TEXT NOT NULL,
  FOREIGN KEY (entry_id) REFERENCES entries(id)
);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id TEXT PRIMARY KEY,
  adapter_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  outcome TEXT NOT NULL,
  http_status INTEGER,
  message TEXT NOT NULL,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  unchanged_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  drift_count INTEGER NOT NULL DEFAULT 0,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS adapter_runtime (
  adapter_id TEXT PRIMARY KEY,
  last_request_at TEXT,
  last_success_at TEXT
);

CREATE TABLE IF NOT EXISTS request_cache (
  request_url TEXT PRIMARY KEY,
  etag TEXT,
  last_modified TEXT,
  fetched_at TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
CREATE INDEX IF NOT EXISTS idx_entries_base ON entries(base_id);
CREATE INDEX IF NOT EXISTS idx_events_entry ON review_events(entry_id);
`;

export function openDatabase(filename: string): DatabaseSync {
  if (filename !== ":memory:") {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON;");
  if (filename !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  db.prepare(
    "INSERT INTO schema_meta(key, value) VALUES('version', '1') ON CONFLICT(key) DO NOTHING",
  ).run();
  return db;
}

let singleton: DatabaseSync | null = null;

export function databasePath(): string {
  return process.env.QUAY_DB_PATH || path.join(process.cwd(), "data", "quay.sqlite");
}

export function getDb(): DatabaseSync {
  if (!singleton) singleton = openDatabase(databasePath());
  return singleton;
}

export function dataDir(): string {
  return path.dirname(databasePath() === ":memory:" ? path.join(process.cwd(), "data", "x") : databasePath());
}
