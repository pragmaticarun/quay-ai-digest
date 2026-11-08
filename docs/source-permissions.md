# Source permissions

Checked 8 November 2026. Pages were read from the official URLs below. This note is the allowlist for Quay. It is not legal advice. If a provider changes the terms, turn the adapter off until someone reads the new text.

Public access alone is not permission. Quay does not ingest AlphaSignal, and it does not copy that product's writing, design, or assets. A feed that returns HTTP 200 is not a license to store titles or article text.

## Daily job

```bash
npm run ingest:daily
```

The same work is `npm run ingest -- --all`. It runs every enabled adapter, continues after one adapter fails, and exits 1 if any enabled adapter errors. Disabled adapters are skipped before any request. Nothing is published.

Each request URL is stored in `request_cache` with its ETag, Last-Modified, and the time of the last success. An unforced run skips a URL for 20 hours. `--force` repeats it. Conditional GET sends `If-None-Match` and `If-Modified-Since` when those values exist. HTTP 304 is a success with an empty body. HTTP 403 and 429 are not retried, and later URLs in that adapter are not called.

This command is local. It is not a GitHub Actions workflow. Do not point it at a public repository. Drafts stay in `data/quay.sqlite`.

A person who wants a daily run on their own machine can add a crontab line. Quay does not install it:

```cron
15 7 * * * cd /path/to/quay && /usr/bin/npm run ingest:daily >> data/ingest-daily.log 2>&1
```

Polling once a day is not the same as a source that publishes once a day.

## Enabled

### arXiv API

- Terms: https://info.arxiv.org/help/api/tou.html
- Manual: https://info.arxiv.org/help/api/user-manual.html
- Metadata license: https://info.arxiv.org/help/license/index.html
- What the terms allow: retrieve, store, transform, and share descriptive metadata (title, abstract, authors, identifiers, categories) under CC0 1.0. They also allow discovery tools that link people back to arXiv.
- What they forbid: storing or serving e-print PDFs or source without the copyright holder's permission, claiming arXiv endorsement, and circumventing rate limits.
- Rate limit stated on the terms page: for the legacy API, RSS, and OAI-PMH, no more than one request every three seconds, and only one connection at a time, across machines you control.
- Manual guidance: cache results. A repeated identical query does not need to run more than once a day.
- Quay's behavior: up to four HTTPS GETs to `export.arxiv.org`, one each for `cat:cs.AI`, `cat:cs.CL`, `cat:cs.CV`, and `cat:cs.LG`, at most 5 results, sorted by `submittedDate`. The host is pinned. Redirects are not followed. The client waits at least 4 seconds between category requests, sends a stored ETag, and skips a category URL for 20 hours after success unless `--force` is set. If an older install recorded an arXiv success and has no per-URL cache yet, `cs.LG` is skipped for 20 hours so that query is not repeated the same day. HTTP 403 and 429 stop the remaining categories and are not retried. PDFs are linked, not stored. The abstract is stored as plain text and labeled as source metadata. Exports and the public Pages snapshot omit it.
- Same paper, two categories: one draft. Topics are unioned. A new version is a separate draft.
- Daily feasibility: four requests, spaced by four seconds, fit a once-a-day job. The slice is the newest five papers in each category. That is not a claim that every category has a new paper every day.

### GitHub Releases API

- Terms, section H (API Terms): https://docs.github.com/en/site-policy/github-terms/github-terms-of-service
- Rate limits: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- Releases: https://docs.github.com/en/rest/releases/releases
- What the terms allow: use of GitHub's API, including through a third-party product, for development or data collection, subject to the terms and the rate limits.
- What they forbid: excessive requests, sharing tokens to exceed limits, and downloading content for spam or to sell personal information. High-throughput or resale access is a separate subscription, which this desk does not use.
- Unauthenticated limit stated in the rate-limit doc: 60 requests per hour per originating IP for public data. Secondary limits can return 403 or 429. Callers must wait for `retry-after` or `x-ratelimit-reset` and must not keep retrying.
- Quay's behavior: no token is sent or requested. Each run calls at most these repositories, `per_page=5`: `pytorch/pytorch`, `vllm-project/vllm`, `ggml-org/llama.cpp`, `huggingface/transformers`, `microsoft/onnxruntime`. It waits at least 4 seconds between those calls, sends a stored ETag, treats 304 as no change, and stops on 403 or 429 without retrying or calling the remaining repositories. Each repository URL is skipped for 20 hours after success unless `--force` is set. Stored fields are the repository, numeric release id, tag, URL, `published_at`, draft and prerelease flags, the author login when present, and a release label only when `name` is 120 characters or shorter. The release body is not stored. `updated_at` is not used as a publication date.
- Daily feasibility: five requests sit under 60 per hour. Releases are irregular. Most days the result is unchanged or not-modified.

## Disabled

### OpenAlex

- Terms PDF, revised 2 October 2026: https://openalex.org/OpenAlex_termsofservice.pdf
- Help pages describe CC0 data and a usage-priced API: https://help.openalex.org/api/authentication/ and https://help.openalex.org/access/overview/
- The terms say unauthorized reproduction or republication of the Data or Database requires Impactstory's prior written consent, and they restrict copying the Data for an unauthorized purpose. That conflicts with the CC0 help pages. The adapter stays off. No API key is requested. A daily job does not call it.

### Hugging Face Hub model API

- Terms, effective 15 September 2022: https://huggingface.co/terms-of-service
- Endpoints: https://huggingface.co/docs/hub/api
- Rate limits, checked 8 November 2026: https://huggingface.co/docs/hub/rate-limits
- The terms say a public repository grants other users a license to use that content through Hugging Face services and functionalities. That is not a grant to cache model metadata and republish it on an independent desk or on GitHub Pages. Hugging Face proprietary materials need written permission before they are republished.
- The rate-limit page describes quotas, including an anonymous API window. A quota is not a reuse license. No token is requested and no model list is fetched. A catalog `lastModified` value is not a publication date and is not stored.
- Daily feasibility of the endpoint is irrelevant until the terms allow storage. The adapter stays off.

### Hugging Face blog RSS

- Feed checked 8 November 2026: https://huggingface.co/blog/feed.xml returned HTTP 200, `content-type: application/rss+xml`. `robots.txt` allows `/`.
- Terms: https://huggingface.co/terms-of-service
- The blog is Hugging Face's own writing. The proprietary-materials clause requires written permission before it is reproduced or republished. The feed is not that permission. No item was saved. The adapter stays off.

### OpenAI news RSS

- Feed checked 8 November 2026: https://openai.com/news/rss.xml returned HTTP 200, `content-type: text/xml`. `robots.txt` allows `/` except `/microsoft-for-startups/`.
- Terms of Use, effective 1 January 2026: https://openai.com/policies/row-terms-of-use/
- Those terms cover use of the services and the user's Input and Output. They do not grant a license to copy or republish OpenAI news posts. The copyright-complaints section treats site content as protected. No item was saved. News can still be filed by hand with a primary citation. Quay does not fetch the article body.

### Google DeepMind blog RSS

- Feed checked 8 November 2026: https://deepmind.google/blog/rss.xml returned HTTP 200, `content-type: application/xml`. `robots.txt` allows `/`.
- Google Terms of Service: https://policies.google.com/terms
- Google keeps the intellectual property rights in its services and in Google content. The license in those terms is for content a user gives Google, not a license for this desk to store and republish DeepMind posts. No service-specific blog license was found. No item was saved. A person can still file a news citation by hand.

## Not a source

AlphaSignal is not called. There is no adapter id for it.
