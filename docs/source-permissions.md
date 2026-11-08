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

## Enabled by operator decision, 8 November 2026

The operator said to enable every previously disabled registered source and accepted responsibility for permission. Quay does not claim those terms were independently verified as a reuse grant. The earlier conflict notes stay here so a later reader can see them. AlphaSignal is still not a source.

None of these adapters publish. They write drafts in the local database. They do not send a credential from the repository, follow redirects, or retry HTTP 401, 402, 403, or 429. Each request URL is skipped for 20 hours after success unless `--force` is set.

### OpenAlex works

- Endpoint: `GET https://api.openalex.org/works?filter=primary_topic.subfield.id:1702,type:article|preprint&sort=publication_date:desc&per_page=5&select=id,display_name,publication_date,doi,updated_date,type,authorships,primary_location`
- Subfield 1702 is Artificial Intelligence. The select list omits abstracts.
- Works API: https://docs.openalex.org/api-entities/works
- Terms PDF, revised 2 October 2026: https://openalex.org/OpenAlex_termsofservice.pdf
- Authentication and rate limits: https://help.openalex.org/api/authentication/ and https://help.openalex.org/access/overview/
- The terms say unauthorized reproduction or republication of the Data or Database needs Impactstory's prior written consent. Help pages also describe CC0 data and a usage-priced API. Quay does not resolve that conflict.
- Status: enabled. A probe without an API key on 8 November 2026 returned HTTP 200 and named a shared anonymous daily budget. If a later call returns 401, 402, or 403, the run is an error. Set `QUAY_OPENALEX_API_KEY` locally if a key is required. Do not commit it.
- `publication_date` is stored as the publication date. `updated_date` is stored only as the catalog update time.

### Hugging Face Hub model API

- Endpoint: `GET https://huggingface.co/api/models?limit=5&sort=lastModified&direction=-1`
- Terms, effective 15 September 2022: https://huggingface.co/terms-of-service
- API: https://huggingface.co/docs/hub/api
- Rate limits, checked 8 November 2026: https://huggingface.co/docs/hub/rate-limits
- The terms say a public repository grants other users a license to use that content through Hugging Face services. They also keep Hugging Face's own materials from republication without written permission. Quay does not treat the anonymous quota as that permission.
- Status: enabled, no token. `createdAt` and `lastModified` are catalog times. Neither is stored as a publication date. `lastModified` is stored as `updatedAt`. Model cards and weights are not requested.

### Hugging Face blog RSS

- Endpoint: `GET https://huggingface.co/blog/feed.xml`
- Checked 8 November 2026: HTTP 200, `content-type: application/rss+xml`.
- Terms: https://huggingface.co/terms-of-service
- Status: enabled. At most five items. Stored fields are title, canonical `/blog/` URL, and `pubDate`. Descriptions are not stored.

### OpenAI news RSS

- Endpoint: `GET https://openai.com/news/rss.xml`
- Checked 8 November 2026: HTTP 200, `content-type: text/xml`.
- Terms of Use, effective 1 January 2026: https://openai.com/policies/row-terms-of-use/
- Those terms cover the services and the user's Input and Output. They do not, on their face, grant republication of news posts. The operator accepted that responsibility anyway.
- Status: enabled. At most five items. Stored fields are title, an `https://openai.com/` URL, and `pubDate`. The article body is not fetched.

### Google DeepMind blog RSS

- Endpoint: `GET https://deepmind.google/blog/rss.xml`
- Checked 8 November 2026: HTTP 200, `content-type: application/xml`.
- Google Terms of Service: https://policies.google.com/terms
- Google keeps rights in Google content. No separate blog licence was found. The operator accepted responsibility for this feed.
- Status: enabled. At most five items. `pubDate` is the publication time. A different modification time is not read. Descriptions are not stored.

## Not a source

AlphaSignal is not called. There is no adapter id for it. Quay does not scrape it or bypass a paywall.
