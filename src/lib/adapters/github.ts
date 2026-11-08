import type { DatabaseSync } from "node:sqlite";
import { parseSourceDate } from "@/lib/dates";
import { SourceHttpError } from "@/lib/errors";
import type { EntryType, SourceCandidate } from "@/lib/types";
import { normalizeCanonicalUrl } from "@/lib/urls";
import { getAdapter } from "@/lib/adapters/registry";
import { USER_AGENT, pinnedGet, pace, type FetchLike } from "@/lib/adapters/http";
import { getRequestCache, isFreshCache, putRequestCache } from "@/lib/request-cache";

export type GithubRepoSpec = {
  owner: string;
  repo: string;
  type: Extract<EntryType, "repo" | "tool">;
  topics: string[];
};

export const GITHUB_REPOS: GithubRepoSpec[] = [
  { owner: "pytorch", repo: "pytorch", type: "repo", topics: ["pytorch", "releases"] },
  { owner: "vllm-project", repo: "vllm", type: "tool", topics: ["inference", "serving"] },
  { owner: "ggml-org", repo: "llama.cpp", type: "tool", topics: ["llama.cpp", "inference"] },
  { owner: "huggingface", repo: "transformers", type: "repo", topics: ["transformers", "releases"] },
  { owner: "microsoft", repo: "onnxruntime", type: "repo", topics: ["onnxruntime", "releases"] },
];

export const GITHUB_PER_PAGE = 5;

type ReleaseJson = {
  id?: number;
  tag_name?: string;
  name?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string | null;
  html_url?: string;
  author?: { login?: string } | null;
};

export function releaseUrl(owner: string, repo: string): string {
  return `https://api.github.com/repos/${owner}/${repo}/releases?per_page=${GITHUB_PER_PAGE}`;
}

export function parseGithubReleases(body: string, spec: GithubRepoSpec, requestUrl: string): { candidates: SourceCandidate[]; skipped: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new SourceHttpError(200, "GitHub response was not JSON.");
  }
  if (!Array.isArray(parsed)) {
    const message = parsed && typeof parsed === "object" && "message" in parsed ? String((parsed as { message: unknown }).message) : "unexpected payload";
    throw new SourceHttpError(200, `GitHub releases payload: ${message.slice(0, 180)}`);
  }
  const candidates: SourceCandidate[] = [];
  let skipped = 0;
  for (const item of parsed as ReleaseJson[]) {
    if (!item || typeof item !== "object") {
      skipped += 1;
      continue;
    }
    if (item.draft) {
      skipped += 1;
      continue;
    }
    if (typeof item.id !== "number" || !item.tag_name || !item.html_url) {
      skipped += 1;
      continue;
    }
    const canonical = normalizeCanonicalUrl(item.html_url);
    const expectedPrefix = `https://github.com/${spec.owner}/${spec.repo}/`;
    if (!canonical || !canonical.startsWith(expectedPrefix)) {
      skipped += 1;
      continue;
    }
    const published = parseSourceDate(item.published_at ?? "");
    const label = typeof item.name === "string" && item.name.trim() && item.name.trim().length <= 120 ? item.name.trim() : null;
    const login = item.author?.login?.trim();
    const prerelease = item.prerelease === true;
    candidates.push({
      origin: "live",
      type: spec.type,
      title: `${spec.owner}/${spec.repo} ${item.tag_name}`,
      canonicalUrl: canonical,
      stableId: `github-release:${item.id}`,
      baseId: `github:${spec.owner}/${spec.repo}`,
      versionLabel: item.tag_name,
      publisher: `GitHub · ${spec.owner}/${spec.repo}`,
      authors: login ? [`${login} (GitHub login on the release object)`] : [],
      topics: spec.topics,
      publishedAt: published.iso,
      updatedAt: null,
      datePrecision: published.precision,
      publishedRaw: published.raw,
      updatedRaw: null,
      sourceExcerpt: null,
      excerptLicense: null,
      sourceLabel: label,
      adapterId: "github-releases",
      sourceRequestUrl: requestUrl,
      citations: [{ label: `GitHub release ${item.tag_name}`, url: canonical, role: "primary" }],
      factSummary: `GitHub's releases API lists tag ${item.tag_name} on ${spec.owner}/${spec.repo}. The numeric release id is ${item.id}. published_at is ${published.iso ?? "absent"}. draft is false. prerelease is ${prerelease}. The release body was not stored.`,
      factSummaryKind: "mechanical",
      licenseNote:
        "Identifiers come from the public GitHub Releases API. Release notes and source archives are not copied. Quay is not affiliated with GitHub.",
    });
  }
  return { candidates, skipped };
}

export async function fetchGithubReleases(
  db: DatabaseSync,
  fetchImpl: FetchLike,
  sleep: (ms: number) => Promise<void>,
  options: { now: string; force?: boolean } = { now: new Date().toISOString() },
) {
  const adapter = getAdapter("github-releases");
  if (!adapter) throw new SourceHttpError(0, "GitHub adapter is missing.");
  const force = options.force === true;
  const candidates: SourceCandidate[] = [];
  let skipped = 0;
  let httpStatus = 0;
  let halted: string | null = null;

  for (const spec of GITHUB_REPOS) {
    const url = releaseUrl(spec.owner, spec.repo);
    const cache = getRequestCache(db, url);
    if (isFreshCache(cache, options.now, force)) {
      skipped += 1;
      continue;
    }
    await pace(db, adapter.id, adapter.minGapMs, sleep);
    const response = await pinnedGet(
      fetchImpl,
      url,
      "api.github.com",
      {
        accept: "application/vnd.github+json",
        "user-agent": USER_AGENT,
        "x-github-api-version": "2022-11-28",
      },
      { etag: cache?.etag, lastModified: cache?.lastModified },
    );
    httpStatus = response.status;
    if (response.status === 304) {
      putRequestCache(db, url, {
        etag: response.headers.get("etag") ?? cache?.etag ?? null,
        lastModified: response.headers.get("last-modified") ?? cache?.lastModified ?? null,
        fetchedAt: options.now,
        status: "not-modified",
      });
      skipped += 1;
      continue;
    }
    if (response.status === 403 || response.status === 429) {
      const reset = response.headers.get("x-ratelimit-reset");
      const retry = response.headers.get("retry-after");
      halted = `GitHub returned HTTP ${response.status} for ${spec.owner}/${spec.repo}. retry-after=${retry ?? "absent"} x-ratelimit-reset=${reset ?? "absent"}. Not retried. Later repositories were not called.`;
      break;
    }
    if (response.status < 200 || response.status >= 300) {
      halted = `GitHub returned HTTP ${response.status} for ${spec.owner}/${spec.repo}. Later repositories were not called.`;
      break;
    }
    const parsed = parseGithubReleases(response.body, spec, url);
    candidates.push(...parsed.candidates);
    skipped += parsed.skipped;
    putRequestCache(db, url, {
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      fetchedAt: options.now,
      status: "ok",
    });
  }

  return { candidates, skipped, httpStatus, halted };
}
