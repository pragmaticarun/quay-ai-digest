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

const DAY = 24 * 60 * 60 * 1000;

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
    kind: "Disabled candidate",
    enabled: false,
    disabledReason:
      "OpenAlex Terms of Service revised 2 October 2026 say unauthorized reproduction or republication of the Data or Database needs Impactstory's prior written consent, and they restrict copying the Data for an unauthorized purpose. Help pages describe the dataset as CC0 and the API as usage-priced. Those statements conflict, so this adapter stays off. No API key is requested.",
    permissionSummary: "Not enabled. Public access alone is not permission, and the terms conflict with the CC0 help pages.",
    rateLimit: "Not used. Anonymous docs mention a per-second cap and a daily usage budget. Quay does not call the API.",
    dailyFeasibility: "Not polled. A daily job cannot include this source until the terms conflict is resolved in writing.",
    stores: "Nothing.",
    doesNotStore: "OpenAlex records are not fetched.",
    docs: [
      { label: "OpenAlex terms PDF", url: "https://openalex.org/OpenAlex_termsofservice.pdf" },
      { label: "OpenAlex authentication and rate limits", url: "https://help.openalex.org/api/authentication/" },
    ],
    requestDescription: "No request is made.",
    minGapMs: 4000,
    successCooldownMs: DAY,
  },
  {
    id: "huggingface-hub",
    title: "Hugging Face Hub model API",
    kind: "Disabled candidate",
    enabled: false,
    disabledReason:
      "Hugging Face Terms of Service, effective 15 September 2022, say a public repository grants other users a license to use that Content through Hugging Face services and functionalities. That is not a grant to cache model metadata and republish it on an independent desk or on GitHub Pages. Hugging Face also retains its own materials and requires written permission before they are republished. The Hub API and the September 2025 rate-limit table describe quotas, including an anonymous API window, but a quota is not a reuse license. No token is requested and no model list is fetched. A model lastModified value would be a catalog timestamp, not a publication date, and it is not stored.",
    permissionSummary: "Not enabled. Model records remain manual citations until a clearer reuse grant exists.",
    rateLimit:
      "Not used. The rate-limit doc, checked 8 November 2026, says anonymous API requests are a fixed 5-minute window (the September 2025 table lists 500) and that HTTP 429 carries RateLimit headers. Quay does not call the API.",
    dailyFeasibility:
      "Not polled. The endpoint exists and a tiny daily list would fit the published quota, but the terms block activation. Daily polling is not the same as a source that may be stored.",
    stores: "Nothing.",
    doesNotStore: "Model cards, README bodies, weights, likes, and inference responses.",
    docs: [
      { label: "Hugging Face terms", url: "https://huggingface.co/terms-of-service" },
      { label: "Hub API endpoints", url: "https://huggingface.co/docs/hub/api" },
      { label: "Hub rate limits", url: "https://huggingface.co/docs/hub/rate-limits" },
    ],
    requestDescription: "No request is made.",
    minGapMs: 4000,
    successCooldownMs: DAY,
  },
  {
    id: "huggingface-blog",
    title: "Hugging Face blog RSS",
    kind: "Disabled candidate",
    enabled: false,
    disabledReason:
      "Checked 8 November 2026. https://huggingface.co/blog/feed.xml returned HTTP 200 and content-type application/rss+xml. robots.txt allows /. The Terms of Service, effective 15 September 2022, say Hugging Face proprietary materials, including the website, may not be reproduced or republished without express written permission. An RSS feed of Hugging Face's own blog is that material. The feed is not a license to store titles, descriptions, or article text. No item was saved.",
    permissionSummary: "Not enabled. A public feed is not permission to reuse the posts.",
    rateLimit: "Not used. A HEAD response on 8 November 2026 included a pages rate-limit policy. Quay does not poll the feed.",
    dailyFeasibility: "Not polled. The blog does not promise a post every day, and the terms block a daily copy.",
    stores: "Nothing.",
    doesNotStore: "Feed titles, descriptions, and article bodies.",
    docs: [
      { label: "Hugging Face blog RSS", url: "https://huggingface.co/blog/feed.xml" },
      { label: "Hugging Face terms", url: "https://huggingface.co/terms-of-service" },
    ],
    requestDescription: "No request is made by the ingest command.",
    minGapMs: 4000,
    successCooldownMs: DAY,
  },
  {
    id: "openai-news",
    title: "OpenAI news RSS",
    kind: "Disabled candidate",
    enabled: false,
    disabledReason:
      "Checked 8 November 2026. https://openai.com/news/rss.xml returned HTTP 200 and content-type text/xml. robots.txt allows / except one unrelated path. OpenAI Terms of Use, effective 1 January 2026, cover use of the services and the user's Input and Output. They do not grant a license to copy or republish OpenAI news posts. The copyright-complaints section treats OpenAI site content as protected. A working RSS feed is not that grant. No item was saved.",
    permissionSummary: "Not enabled. News items can still be added by hand with a primary citation. Quay does not fetch the article body.",
    rateLimit: "Not used.",
    dailyFeasibility: "Not polled. OpenAI publishes more than once on some days and not at all on others. That cadence is not permission to store the feed.",
    stores: "Nothing.",
    doesNotStore: "Feed titles, descriptions, and article bodies.",
    docs: [
      { label: "OpenAI news RSS", url: "https://openai.com/news/rss.xml" },
      { label: "OpenAI Terms of Use", url: "https://openai.com/policies/row-terms-of-use/" },
    ],
    requestDescription: "No request is made by the ingest command.",
    minGapMs: 4000,
    successCooldownMs: DAY,
  },
  {
    id: "deepmind-blog",
    title: "Google DeepMind blog RSS",
    kind: "Disabled candidate",
    enabled: false,
    disabledReason:
      "Checked 8 November 2026. https://deepmind.google/blog/rss.xml returned HTTP 200 and content-type application/xml. robots.txt allows /. Google Terms of Service say Google keeps the intellectual property rights in its services and in Google content, and that you may use that content only as the terms and service-specific terms allow. The licence in those terms is for content a user gives Google, not a licence for Quay to store and republish DeepMind posts. No service-specific blog licence was found. A feed pubDate would be the feed's claimed publication time and is not the same thing as a later modification time. Neither was stored.",
    permissionSummary: "Not enabled. A person can still file a news citation by hand.",
    rateLimit: "Not used.",
    dailyFeasibility: "Not polled. DeepMind posts are irregular. The feed responding is not a daily content licence.",
    stores: "Nothing.",
    doesNotStore: "Feed titles, descriptions, and article bodies.",
    docs: [
      { label: "DeepMind blog RSS", url: "https://deepmind.google/blog/rss.xml" },
      { label: "Google Terms of Service", url: "https://policies.google.com/terms" },
    ],
    requestDescription: "No request is made by the ingest command.",
    minGapMs: 4000,
    successCooldownMs: DAY,
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
