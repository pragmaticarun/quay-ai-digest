export type AdapterDoc = { label: string; url: string };

export type AdapterDefinition = {
  id: string;
  title: string;
  kind: string;
  enabled: boolean;
  disabledReason: string | null;
  permissionSummary: string;
  rateLimit: string;
  dailyFeasibility: string;
  stores: string;
  doesNotStore: string;
  docs: AdapterDoc[];
  requestDescription: string;
  minGapMs: number;
  successCooldownMs: number;
};

const USER_PERMISSION =
  "On 8 November 2026 the operator accepted responsibility for permission to ingest this public source. Quay records the official terms link and does not claim that permission was independently verified.";

export const adapters: AdapterDefinition[] = [
  {
    id: "arxiv",
    title: "arXiv API (cs.AI, cs.CL, cs.CV, cs.LG)",
    kind: "Atom metadata API",
    enabled: true,
    disabledReason: null,
    permissionSummary:
      "Checked 8 November 2026 against https://info.arxiv.org/help/api/tou.html and the API user manual. Descriptive metadata, including title, abstract, authors, identifiers, and categories, is usable under CC0 1.0. The terms explicitly allow retrieving, storing, transforming, and sharing that metadata, and building discovery tools that link people back to arXiv. Quay does not store or serve PDFs or source files, and it does not claim arXiv endorsement.",
    rateLimit:
      "Legacy API rule: no more than one request every three seconds, and only one connection at a time, across machines you control. The user manual says to cache and that a repeated identical query need not run more than once a day. Quay waits at least 4 seconds between category requests, sends If-None-Match when it has an ETag, does not follow redirects, and does not retry HTTP 403 or 429. Each category URL is skipped for 20 hours after a success unless --force is set.",
    dailyFeasibility:
      "A daily job can run. Four category requests, five results each, sit under the three-second rule when spaced by four seconds. arXiv accepts papers throughout the day; this slice is the newest five per category, not a claim that every category has a new paper every day. The same paper id and version returned by two categories is one draft. A new version stays a separate draft.",
    stores:
      "Title, authors, categories, versioned arXiv id, abstract-page URL, PDF URL as a citation only, the API published timestamp and the separate API updated timestamp, and the abstract as plain-text source metadata.",
    doesNotStore: "PDFs, TeX source, and any claim that Quay wrote the abstract. Exports and the public Pages snapshot omit the abstract.",
    docs: [
      { label: "arXiv API terms of use", url: "https://info.arxiv.org/help/api/tou.html" },
      { label: "arXiv API user manual", url: "https://info.arxiv.org/help/api/user-manual.html" },
      { label: "Metadata license", url: "https://info.arxiv.org/help/license/index.html" },
    ],
    requestDescription:
      "Up to four HTTPS GETs to export.arxiv.org, one each for cat:cs.AI, cat:cs.CL, cat:cs.CV, and cat:cs.LG, sorted by submittedDate, at most 5 results. Host is pinned. Redirects are not followed.",
    minGapMs: 4000,
    successCooldownMs: 0,
  },
  {
    id: "github-releases",
    title: "GitHub Releases API",
    kind: "Public REST API",
    enabled: true,
    disabledReason: null,
    permissionSummary:
      "Checked 8 November 2026 against GitHub Terms of Service section H and the REST rate-limit docs. Section H covers API use by a third-party product, including data collection, and forbids excessive requests, sharing tokens to dodge limits, and downloading content for spam or to sell personal information. Unauthenticated requests for public data are allowed at 60 per hour per IP. Quay does not send a token. It requests release identifiers only and does not copy release-note bodies.",
    rateLimit:
      "Unauthenticated primary limit: 60 requests per hour. Secondary limits can return 403 or 429. Quay calls at most five allowlisted repositories, waits at least 4 seconds between them, sends If-None-Match when it has an ETag, treats 304 as no change, and stops on 403 or 429 without retrying or calling the remaining repositories. Each repository URL is skipped for 20 hours after a success unless --force is set.",
    dailyFeasibility:
      "A daily job uses at most five requests, well under 60 per hour. Releases are not published every day. The poll checks for new tags; most days the result is unchanged or not-modified. published_at is the release publication time. Quay does not treat another timestamp as that date.",
    stores:
      "Repository, numeric release id, tag, html URL, published_at, draft and prerelease flags, and a release label only when GitHub's name field is 120 characters or shorter.",
    doesNotStore: "Release note body, source archives, or user profile data beyond the public login when the API includes author.login.",
    docs: [
      { label: "GitHub Terms of Service (API terms)", url: "https://docs.github.com/en/site-policy/github-terms/github-terms-of-service" },
      { label: "REST rate limits", url: "https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api" },
      { label: "Releases API", url: "https://docs.github.com/en/rest/releases/releases" },
    ],
    requestDescription:
      "HTTPS GET https://api.github.com/repos/{owner}/{repo}/releases?per_page=5 for pytorch/pytorch, vllm-project/vllm, ggml-org/llama.cpp, huggingface/transformers, and microsoft/onnxruntime only.",
    minGapMs: 4000,
    successCooldownMs: 0,
  },
  {
    id: "openalex-works",
    title: "OpenAlex works API",
    kind: "Public REST API",
    enabled: true,
    disabledReason: null,
    permissionSummary: `${USER_PERMISSION} Terms PDF revised 2 October 2026: https://openalex.org/OpenAlex_termsofservice.pdf. Help pages also describe CC0 data and a usage-priced API. Those statements were not reconciled by Quay.`,
    rateLimit:
      "One HTTPS GET. A probe on 8 November 2026 without an API key returned HTTP 200 and rate-limit headers for a shared anonymous daily budget. HTTP 401, 402, 403, and 429 are not retried. A local QUAY_OPENALEX_API_KEY, if the operator sets one, is sent as Authorization and is not stored in the repository.",
    dailyFeasibility:
      "A daily job can run one request for five recent Artificial Intelligence articles or preprints. OpenAlex does not publish a new work on a schedule Quay controls. The same work id updates one draft.",
    stores:
      "OpenAlex work id, display name, publication_date, updated_date, type, up to eight author display names, and the venue name when present. publication_date is the publication date. updated_date is only the catalog update time.",
    doesNotStore: "Abstracts, full text, PDF URLs, landing-page URLs, and author emails.",
    docs: [
      { label: "OpenAlex works documentation", url: "https://docs.openalex.org/api-entities/works" },
      { label: "OpenAlex terms PDF", url: "https://openalex.org/OpenAlex_termsofservice.pdf" },
      { label: "OpenAlex authentication and rate limits", url: "https://help.openalex.org/api/authentication/" },
    ],
    requestDescription:
      "HTTPS GET https://api.openalex.org/works with filter primary_topic.subfield.id:1702,type:article|preprint, sort publication_date:desc, per_page=5, and a select list that omits abstracts. Host is pinned. Redirects are not followed.",
    minGapMs: 4000,
    successCooldownMs: 0,
  },
  {
    id: "huggingface-hub",
    title: "Hugging Face Hub model API",
    kind: "Public REST API",
    enabled: true,
    disabledReason: null,
    permissionSummary: `${USER_PERMISSION} Terms, effective 15 September 2022: https://huggingface.co/terms-of-service. The Hub API documents a public models list. A quota is not treated here as a reuse grant.`,
    rateLimit:
      "One HTTPS GET, limit=5, no token. The rate-limit doc, checked 8 November 2026, describes an anonymous API window (the September 2025 table lists 500 requests per 5 minutes). A live response the same day advertised RateLimit-Policy q=500 w=300. HTTP 401, 403, and 429 are not retried.",
    dailyFeasibility:
      "A daily job can run one request for the five most recently modified public models. lastModified is a catalog timestamp, not a publication date, and most days the models are not newly published papers.",
    stores:
      "Model id, author prefix, pipeline tag, library name, and lastModified as updatedAt. createdAt is mentioned in the mechanical summary and is not stored as publishedAt.",
    doesNotStore: "Model cards, README bodies, weights, likes, downloads, and inference responses.",
    docs: [
      { label: "Hugging Face terms", url: "https://huggingface.co/terms-of-service" },
      { label: "Hub API endpoints", url: "https://huggingface.co/docs/hub/api" },
      { label: "Hub rate limits", url: "https://huggingface.co/docs/hub/rate-limits" },
    ],
    requestDescription:
      "HTTPS GET https://huggingface.co/api/models?limit=5&sort=lastModified&direction=-1. Host is pinned. full=true is not set. Redirects are not followed.",
    minGapMs: 4000,
    successCooldownMs: 0,
  },
  {
    id: "huggingface-blog",
    title: "Hugging Face blog RSS",
    kind: "Public RSS",
    enabled: true,
    disabledReason: null,
    permissionSummary: `${USER_PERMISSION} Feed: https://huggingface.co/blog/feed.xml. Terms, effective 15 September 2022: https://huggingface.co/terms-of-service.`,
    rateLimit:
      "One HTTPS GET. A response on 8 November 2026 was HTTP 200, content-type application/rss+xml, with a pages rate-limit policy of 100 requests per 300 seconds. HTTP 403 and 429 are not retried. At most five items are kept.",
    dailyFeasibility: "A daily job can run. The blog does not promise a post every day. A repeat inside 20 hours uses the cached URL unless --force is set.",
    stores: "Title, canonical blog URL, and pubDate as the publication time.",
    doesNotStore: "Descriptions, article bodies, and any timestamp other than pubDate.",
    docs: [
      { label: "Hugging Face blog RSS", url: "https://huggingface.co/blog/feed.xml" },
      { label: "Hugging Face terms", url: "https://huggingface.co/terms-of-service" },
    ],
    requestDescription: "HTTPS GET https://huggingface.co/blog/feed.xml. Host is pinned. Links must stay on https://huggingface.co/blog/. Redirects are not followed.",
    minGapMs: 4000,
    successCooldownMs: 0,
  },
  {
    id: "openai-news",
    title: "OpenAI news RSS",
    kind: "Public RSS",
    enabled: true,
    disabledReason: null,
    permissionSummary: `${USER_PERMISSION} Feed: https://openai.com/news/rss.xml. Terms of Use, effective 1 January 2026: https://openai.com/policies/row-terms-of-use/.`,
    rateLimit: "One HTTPS GET. A response on 8 November 2026 was HTTP 200, content-type text/xml. HTTP 403 and 429 are not retried. At most five items are kept. No article page is fetched.",
    dailyFeasibility: "A daily job can run. OpenAI publishes more than once on some days and not at all on others.",
    stores: "Title, canonical openai.com URL, and pubDate as the publication time.",
    doesNotStore: "Descriptions, article bodies, and any timestamp other than pubDate.",
    docs: [
      { label: "OpenAI news RSS", url: "https://openai.com/news/rss.xml" },
      { label: "OpenAI Terms of Use", url: "https://openai.com/policies/row-terms-of-use/" },
    ],
    requestDescription: "HTTPS GET https://openai.com/news/rss.xml. Host is pinned. Links must stay on https://openai.com/. Redirects are not followed.",
    minGapMs: 4000,
    successCooldownMs: 0,
  },
  {
    id: "deepmind-blog",
    title: "Google DeepMind blog RSS",
    kind: "Public RSS",
    enabled: true,
    disabledReason: null,
    permissionSummary: `${USER_PERMISSION} Feed: https://deepmind.google/blog/rss.xml. Google Terms of Service: https://policies.google.com/terms.`,
    rateLimit: "One HTTPS GET. A response on 8 November 2026 was HTTP 200, content-type application/xml. HTTP 403 and 429 are not retried. At most five items are kept. No article page is fetched.",
    dailyFeasibility: "A daily job can run. DeepMind posts are irregular. pubDate is the feed's publication time and is not replaced with a modification time.",
    stores: "Title, canonical deepmind.google blog URL, and pubDate as the publication time.",
    doesNotStore: "Descriptions, article bodies, and any timestamp other than pubDate.",
    docs: [
      { label: "DeepMind blog RSS", url: "https://deepmind.google/blog/rss.xml" },
      { label: "Google Terms of Service", url: "https://policies.google.com/terms" },
    ],
    requestDescription: "HTTPS GET https://deepmind.google/blog/rss.xml. Host is pinned. Links must stay on https://deepmind.google/blog/. Redirects are not followed.",
    minGapMs: 4000,
    successCooldownMs: 0,
  },
];

export function getAdapter(id: string): AdapterDefinition | undefined {
  return adapters.find((adapter) => adapter.id === id);
}

export function evaluateCooldown(
  lastSuccessAt: string | null,
  nowIso: string,
  cooldownMs: number,
  force: boolean,
): { ok: true } | { ok: false; reason: string } {
  if (!lastSuccessAt || force || cooldownMs <= 0) return { ok: true };
  const elapsed = Date.parse(nowIso) - Date.parse(lastSuccessAt);
  if (Number.isNaN(elapsed)) return { ok: true };
  if (elapsed < cooldownMs) {
    const next = new Date(Date.parse(lastSuccessAt) + cooldownMs).toISOString();
    return {
      ok: false,
      reason: `Cached. Last success was ${lastSuccessAt}. An unforced fetch is refused until ${next} so this desk does not repeat the same source call.`,
    };
  }
  return { ok: true };
}
