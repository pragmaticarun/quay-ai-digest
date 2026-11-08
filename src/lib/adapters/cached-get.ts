import type { DatabaseSync } from "node:sqlite";
import { SourceHttpError } from "@/lib/errors";
import type { SourceCandidate } from "@/lib/types";
import { getAdapter } from "@/lib/adapters/registry";
import { USER_AGENT, pinnedGet, pace, type FetchLike } from "@/lib/adapters/http";
import { getRequestCache, isFreshCache, putRequestCache } from "@/lib/request-cache";

export type FetchBatch = {
  candidates: SourceCandidate[];
  skipped: number;
  httpStatus: number;
  halted: string | null;
};

export async function fetchOneCached(
  db: DatabaseSync,
  fetchImpl: FetchLike,
  sleep: (ms: number) => Promise<void>,
  options: { now: string; force?: boolean },
  request: {
    adapterId: string;
    url: string;
    host: string;
    headers?: Record<string, string>;
    haltNote?: (status: number) => string;
    parse: (body: string, requestUrl: string) => { candidates: SourceCandidate[]; skipped: number };
  },
): Promise<FetchBatch> {
  const adapter = getAdapter(request.adapterId);
  if (!adapter) throw new SourceHttpError(0, `Adapter ${request.adapterId} is missing.`);
  const force = options.force === true;
  const cache = getRequestCache(db, request.url);
  if (isFreshCache(cache, options.now, force)) {
    return { candidates: [], skipped: 1, httpStatus: 0, halted: null };
  }
  await pace(db, adapter.id, adapter.minGapMs, sleep);
  const response = await pinnedGet(
    fetchImpl,
    request.url,
    request.host,
    {
      "user-agent": USER_AGENT,
      accept: "application/json, application/xml, text/xml, application/rss+xml",
      ...request.headers,
    },
    { etag: cache?.etag, lastModified: cache?.lastModified },
  );
  if (response.status === 304) {
    putRequestCache(db, request.url, {
      etag: response.headers.get("etag") ?? cache?.etag ?? null,
      lastModified: response.headers.get("last-modified") ?? cache?.lastModified ?? null,
      fetchedAt: options.now,
      status: "not-modified",
    });
    return { candidates: [], skipped: 1, httpStatus: 304, halted: null };
  }
  if (response.status === 401 || response.status === 402 || response.status === 403 || response.status === 429 || response.status < 200 || response.status >= 300) {
    const retry = response.headers.get("retry-after");
    const note = request.haltNote?.(response.status) ?? "";
    return {
      candidates: [],
      skipped: 0,
      httpStatus: response.status,
      halted: `${request.adapterId} returned HTTP ${response.status}. retry-after=${retry ?? "absent"}. Not retried.${note ? ` ${note}` : ""}`,
    };
  }
  const parsed = request.parse(response.body, request.url);
  putRequestCache(db, request.url, {
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    fetchedAt: options.now,
    status: "ok",
  });
  return { candidates: parsed.candidates, skipped: parsed.skipped, httpStatus: response.status, halted: null };
}
