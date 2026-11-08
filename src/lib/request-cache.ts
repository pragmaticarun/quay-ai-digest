import type { DatabaseSync } from "node:sqlite";

export const SOURCE_CACHE_MS = 20 * 60 * 60 * 1000;

export type RequestCache = {
  requestUrl: string;
  etag: string | null;
  lastModified: string | null;
  fetchedAt: string;
  status: string;
};

export function getRequestCache(db: DatabaseSync, requestUrl: string): RequestCache | null {
  const row = db.prepare("SELECT * FROM request_cache WHERE request_url = ?").get(requestUrl) as
    | { request_url: string; etag: string | null; last_modified: string | null; fetched_at: string; status: string }
    | undefined;
  if (!row) return null;
  return {
    requestUrl: row.request_url,
    etag: row.etag,
    lastModified: row.last_modified,
    fetchedAt: row.fetched_at,
    status: row.status,
  };
}

export function putRequestCache(
  db: DatabaseSync,
  requestUrl: string,
  value: { etag: string | null; lastModified: string | null; fetchedAt: string; status: string },
) {
  db.prepare(
    `INSERT INTO request_cache(request_url, etag, last_modified, fetched_at, status)
     VALUES(?, ?, ?, ?, ?)
     ON CONFLICT(request_url) DO UPDATE SET
       etag = excluded.etag,
       last_modified = excluded.last_modified,
       fetched_at = excluded.fetched_at,
       status = excluded.status`,
  ).run(requestUrl, value.etag, value.lastModified, value.fetchedAt, value.status);
}

export function isFreshCache(cache: RequestCache | null, nowIso: string, force: boolean): boolean {
  if (force || !cache?.fetchedAt) return false;
  const elapsed = Date.parse(nowIso) - Date.parse(cache.fetchedAt);
  if (Number.isNaN(elapsed)) return false;
  return elapsed >= 0 && elapsed < SOURCE_CACHE_MS;
}
