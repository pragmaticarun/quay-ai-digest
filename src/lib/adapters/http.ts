import type { DatabaseSync } from "node:sqlite";
import { markAdapterRequest } from "@/lib/entries";
import { SourceHttpError } from "@/lib/errors";

export const USER_AGENT = "QuayLedger/0.1 (local editorial desk; metadata only; no account)";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function assertPinnedUrl(raw: string, host: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new SourceHttpError(0, "Refusing a non-HTTPS source URL.");
  if (url.hostname !== host) throw new SourceHttpError(0, `Refusing unexpected host ${url.hostname}.`);
  if (url.username || url.password) throw new SourceHttpError(0, "Refusing credentials in a source URL.");
}

export async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new SourceHttpError(response.status, `Response content-length ${declared} exceeds the ${maxBytes} byte cap.`);
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    throw new SourceHttpError(response.status, `Response body exceeds the ${maxBytes} byte cap.`);
  }
  return new TextDecoder().decode(buffer);
}

export async function pace(
  db: DatabaseSync,
  adapterId: string,
  minGapMs: number,
  sleep: (ms: number) => Promise<void>,
): Promise<void> {
  const row = db.prepare("SELECT last_request_at FROM adapter_runtime WHERE adapter_id = ?").get(adapterId) as
    | { last_request_at?: string }
    | undefined;
  if (row?.last_request_at) {
    const elapsed = Date.now() - Date.parse(row.last_request_at);
    if (elapsed < minGapMs) await sleep(minGapMs - elapsed);
  }
  markAdapterRequest(db, adapterId, new Date().toISOString());
}

export type ConditionalValidators = { etag?: string | null; lastModified?: string | null };

export async function pinnedGet(
  fetchImpl: FetchLike,
  url: string,
  host: string,
  headers: Record<string, string>,
  validators?: ConditionalValidators,
): Promise<{ status: number; body: string; headers: Headers }> {
  assertPinnedUrl(url, host);
  const requestHeaders = { ...headers };
  if (validators?.etag) requestHeaders["if-none-match"] = validators.etag;
  if (validators?.lastModified) requestHeaders["if-modified-since"] = validators.lastModified;
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "manual",
    headers: requestHeaders,
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 304) return { status: 304, body: "", headers: response.headers };
  if (response.status >= 300 && response.status < 400) {
    throw new SourceHttpError(response.status, "Source redirected. Quay does not follow redirects.");
  }
  const body = await readCapped(response, 1_500_000);
  return { status: response.status, body, headers: response.headers };
}
