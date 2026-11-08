import type { DatabaseSync } from "node:sqlite";
import { parseSourceDate } from "@/lib/dates";
import { SourceHttpError } from "@/lib/errors";
import type { SourceCandidate } from "@/lib/types";
import { fetchOneCached } from "@/lib/adapters/cached-get";
import type { FetchLike } from "@/lib/adapters/http";

export const HF_MODELS_URL = "https://huggingface.co/api/models?limit=5&sort=lastModified&direction=-1";
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,96}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,96}){0,3}$/;

type HubModel = {
  id?: unknown;
  private?: unknown;
  lastModified?: unknown;
  createdAt?: unknown;
  pipeline_tag?: unknown;
  library_name?: unknown;
  likes?: unknown;
  downloads?: unknown;
  cardData?: unknown;
  readme?: unknown;
};

export function parseHuggingFaceModels(body: string, requestUrl: string): { candidates: SourceCandidate[]; skipped: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new SourceHttpError(200, "Hugging Face model response was not JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new SourceHttpError(200, "Hugging Face model response was not a list.");
  }
  const candidates: SourceCandidate[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const item of parsed as HubModel[]) {
    if (candidates.length >= 5) break;
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !MODEL_ID.test(item.id)) {
      skipped += 1;
      continue;
    }
    if (item.private === true) {
      skipped += 1;
      continue;
    }
    if (seen.has(item.id)) {
      skipped += 1;
      continue;
    }
    seen.add(item.id);
    const canonical = `https://huggingface.co/${item.id}`;
    const modified = parseSourceDate(typeof item.lastModified === "string" ? item.lastModified : "");
    const created = typeof item.createdAt === "string" ? item.createdAt : "absent";
    const topics = [item.pipeline_tag, item.library_name]
      .filter((topic): topic is string => typeof topic === "string" && topic.trim().length > 0 && topic.trim().length <= 80)
      .map((topic) => topic.trim());
    if (!topics.includes("huggingface")) topics.unshift("huggingface");
    const author = item.id.includes("/") ? item.id.slice(0, item.id.indexOf("/")) : item.id;
    candidates.push({
      origin: "live",
      type: "model",
      title: item.id,
      canonicalUrl: canonical,
      stableId: `hf-model:${item.id}`,
      baseId: `hf-model:${item.id}`,
      versionLabel: null,
      publisher: "Hugging Face Hub",
      authors: [author],
      topics: topics.slice(0, 6),
      publishedAt: null,
      updatedAt: modified.iso,
      datePrecision: "unknown",
      publishedRaw: null,
      updatedRaw: modified.raw,
      sourceExcerpt: null,
      excerptLicense: null,
      sourceLabel: null,
      adapterId: "huggingface-hub",
      sourceRequestUrl: requestUrl,
      citations: [{ label: "Hugging Face model page", url: canonical, role: "primary" }],
      factSummary: `Hugging Face Hub lists model ${item.id}. createdAt is ${created} and is a catalog creation time, not a publication date, so it is not stored as publishedAt. lastModified is ${modified.iso ?? "absent"} and is stored only as updatedAt. Likes and downloads were not copied. The model card and weights were not stored.`,
      factSummaryKind: "mechanical",
      licenseNote:
        "Identifiers come from the public Hugging Face Hub models API. Model cards, README bodies, and weights are not copied. The operator accepted responsibility for reuse on 8 November 2026. Quay has not independently verified that the Hugging Face terms grant republication.",
    });
  }
  return { candidates, skipped };
}

export function fetchHuggingFaceModels(
  db: DatabaseSync,
  fetchImpl: FetchLike,
  sleep: (ms: number) => Promise<void>,
  options: { now: string; force?: boolean } = { now: new Date().toISOString() },
) {
  return fetchOneCached(db, fetchImpl, sleep, options, {
    adapterId: "huggingface-hub",
    url: HF_MODELS_URL,
    host: "huggingface.co",
    headers: { accept: "application/json" },
    haltNote: (status) =>
      status === 401
        ? "No Hugging Face token was sent. If the Hub now requires a token, this adapter stops rather than inventing a credential."
        : "",
    parse: parseHuggingFaceModels,
  });
}
