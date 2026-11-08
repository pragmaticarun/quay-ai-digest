import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { fetchArxiv } from "@/lib/adapters/arxiv";
import { fetchGithubReleases } from "@/lib/adapters/github";
import { fetchHuggingFaceModels } from "@/lib/adapters/huggingface-hub";
import { fetchOpenAlexWorks } from "@/lib/adapters/openalex";
import { fetchDeepMindBlog, fetchHuggingFaceBlog, fetchOpenAiNews } from "@/lib/adapters/rss";
import type { FetchLike } from "@/lib/adapters/http";
import { adapters, evaluateCooldown, getAdapter } from "@/lib/adapters/registry";
import {
  getAdapterRuntime,
  ingestCandidate,
  insertRun,
  markAdapterSuccess,
  updateRun,
} from "@/lib/entries";
import { EditorError, SourceHttpError } from "@/lib/errors";
import type { IngestRun } from "@/lib/types";

let chain: Promise<unknown> = Promise.resolve();

export function withIngestLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const fetchers = {
  arxiv: fetchArxiv,
  "github-releases": fetchGithubReleases,
  "openalex-works": fetchOpenAlexWorks,
  "huggingface-hub": fetchHuggingFaceModels,
  "huggingface-blog": fetchHuggingFaceBlog,
  "openai-news": fetchOpenAiNews,
  "deepmind-blog": fetchDeepMindBlog,
} as const;

export async function runEnabledAdapters(
  db: DatabaseSync,
  options: { force?: boolean; now?: string; fetchImpl?: FetchLike; sleepImpl?: (ms: number) => Promise<void> } = {},
): Promise<IngestRun[]> {
  const runs: IngestRun[] = [];
  for (const adapter of adapters) {
    if (!adapter.enabled) continue;
    runs.push(await runAdapter(db, adapter.id, options));
  }
  return runs;
}

export async function runAdapter(
  db: DatabaseSync,
  adapterId: string,
  options: { force?: boolean; now?: string; fetchImpl?: FetchLike; sleepImpl?: (ms: number) => Promise<void> } = {},
): Promise<IngestRun> {
  return withIngestLock(() => runAdapterUnlocked(db, adapterId, options));
}

async function runAdapterUnlocked(
  db: DatabaseSync,
  adapterId: string,
  options: { force?: boolean; now?: string; fetchImpl?: FetchLike; sleepImpl?: (ms: number) => Promise<void> },
): Promise<IngestRun> {
  const adapter = getAdapter(adapterId);
  if (!adapter) throw new EditorError("not_found", "Unknown adapter.", 404);
  const now = options.now ?? new Date().toISOString();
  const run: IngestRun = {
    id: randomUUID(),
    adapterId,
    startedAt: now,
    finishedAt: null,
    outcome: "running",
    httpStatus: null,
    message: "",
    fetchedCount: 0,
    createdCount: 0,
    unchangedCount: 0,
    updatedCount: 0,
    driftCount: 0,
    conflictCount: 0,
    skippedCount: 0,
  };
  insertRun(db, run);
  const finish = (patch: Partial<IngestRun>) => {
    Object.assign(run, patch, { finishedAt: options.now ?? new Date().toISOString() });
    updateRun(db, run);
    return run;
  };

  if (!adapter.enabled) {
    return finish({ outcome: "skipped", message: adapter.disabledReason ?? "Adapter disabled." });
  }
  const runtime = getAdapterRuntime(db, adapterId);
  const gate = evaluateCooldown(runtime.lastSuccessAt, now, adapter.successCooldownMs, options.force === true);
  if (!gate.ok) return finish({ outcome: "skipped", message: gate.reason });

  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleepImpl ?? realSleep;
  try {
    const fetchOptions = { now, force: options.force === true };
    const fetchFor = fetchers[adapterId as keyof typeof fetchers];
    const fetched = fetchFor ? await fetchFor(db, fetchImpl, sleep, fetchOptions) : null;
    if (!fetched) {
      return finish({ outcome: "skipped", message: "This adapter has no fetch implementation." });
    }
    for (const candidate of fetched.candidates) {
      const effect = ingestCandidate(db, { ...candidate, origin: "live" }, now);
      if (effect.kind === "created") run.createdCount += 1;
      if (effect.kind === "unchanged") run.unchangedCount += 1;
      if (effect.kind === "updated") run.updatedCount += 1;
      if (effect.kind === "drift") run.driftCount += 1;
      if (effect.kind === "conflict") run.conflictCount += 1;
    }
    run.fetchedCount = fetched.candidates.length;
    run.skippedCount = fetched.skipped;
    const summary = `Fetched ${fetched.candidates.length} candidate(s). Created ${run.createdCount}, unchanged ${run.unchangedCount}, updated ${run.updatedCount}, drift ${run.driftCount}, conflict ${run.conflictCount}, skipped ${fetched.skipped}. Nothing was auto-published.`;
    if (fetched.halted) {
      return finish({
        outcome: "error",
        httpStatus: fetched.httpStatus || null,
        message: `${summary} ${fetched.halted}`.slice(0, 500),
      });
    }
    markAdapterSuccess(db, adapterId, now);
    return finish({
      outcome: "ok",
      httpStatus: fetched.httpStatus || null,
      message: summary,
    });
  } catch (error) {
    const status = error instanceof SourceHttpError ? error.status : null;
    const message = error instanceof Error ? error.message : "Source request failed.";
    return finish({
      outcome: "error",
      httpStatus: status || null,
      message: message.slice(0, 500),
    });
  }
}
