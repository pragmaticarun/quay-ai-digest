# Quay

Quay is a local editorial desk for reviewed notes about machine-learning systems. It keeps a public log of papers, repositories, tools, and hand-filed news or model citations. Sources land as drafts. A person on this machine publishes or rejects them. The public log and the digest export include published records only.

The name, type, and layout are original. The attached research note in [docs/research-brief.md](docs/research-brief.md) is market context. Quay does not use AlphaSignal's name, writing, design, or assets, and it does not call that site.

The editor and the database stay on this machine. A separate static reading site can be built for GitHub Pages from `site/published.json`, which starts empty. See [docs/pages-hosting.md](docs/pages-hosting.md). Nothing here sends email, tracks readers, or asks for an account.

## Requirements

- Node.js 22.13 or newer. This desk was verified on Node.js 22.23.4. It uses `node:sqlite`, which prints an experimental warning. That warning is expected.
- npm.

No API token is required. The GitHub adapter is unauthenticated. Do not add a GitHub, Hugging Face, or OpenAlex credential.

## Run

```bash
npm install
npm run dev
```

The desk listens on [http://127.0.0.1:43127](http://127.0.0.1:43127) and binds to loopback only. Production mode, after `npm run build`:

```bash
npm start
```

A fresh database is empty. The public log says so. Counts on the page are computed from the local SQLite file, not from a hardcoded inventory.

## Editor token

Mutations stay on this machine. The first call creates `data/editor-token` (mode `0600`) or reuses `QUAY_EDITOR_TOKEN` when that variable is set.

```bash
npm run token
```

Paste the printed value into the Editor page in this browser. The page stores it in `sessionStorage` under `quay.editorToken.v1` and sends `Authorization: Bearer`. The token is not written into the HTML. A request without the token is `401`. A browser `Origin` whose host does not match `Host` is `403`. A token in the query string is `400`. There is no CORS header.

The command-line review tools read the database directly and do not need the bearer token. They are still local: they only work on a machine that can open the SQLite file.

## Ingest

```bash
npm run ingest -- arxiv
npm run ingest -- github-releases
npm run ingest:daily
```

`ingest:daily` runs every enabled adapter and exits 1 if one of them errors. It does not publish. Add it to your own crontab if you want a daily run. This repository does not install cron and does not run ingest in GitHub Actions.

Enabled adapters, checked 8 November 2026:

| Id | Call | Repeat bound |
| --- | --- | --- |
| `arxiv` | Four HTTPS GETs to `export.arxiv.org` for `cs.AI`, `cs.CL`, `cs.CV`, and `cs.LG`, at most 5 results each | Each category URL is skipped for 20 hours unless `--force` |
| `github-releases` | Releases for `pytorch/pytorch`, `vllm-project/vllm`, `ggml-org/llama.cpp`, `huggingface/transformers`, and `microsoft/onnxruntime`, 5 per repo, no token | Each repository URL is skipped for 20 hours unless `--force` |

Both wait at least 4 seconds between requests, send a stored ETag, do not follow redirects, and do not retry `403` or `429`. A 429 also stops the remaining URLs in that adapter. The same arXiv paper id and version from two categories is one draft, with topics unioned. A new version stays a second draft. GitHub `published_at` is the publication time. Another timestamp is not stored as that date.

Disabled adapters are listed on the Sources page and in [docs/source-permissions.md](docs/source-permissions.md): OpenAlex, the Hugging Face Hub model API, the Hugging Face blog, OpenAI news, Google DeepMind, and AlphaSignal. They make no network call. A public RSS feed is not permission to store it. If a live call fails, the run is stored as an error and already published rows are left as they are.

News and model records have no live adapter. File them by hand in the editor with a primary `http` or `https` citation. Quay does not fetch the page body.

## Review

The editor page, after the token is unlocked, lists drafts, saves an editorial summary, and publishes or rejects. Publishing requires all of the following:

- a factual summary of at least 40 characters saved by an editor (a mechanical placeholder is not enough)
- one primary `http` or `https` citation
- a review note of at least 8 characters
- an explicit confirm control

Fixture rows cannot be published. The same gate is available from the shell:

```bash
npm run review -- list
npm run review -- show <id>
npm run review -- save <id> --fact "..." --interpretation "..." --caveats "..." --relevance "..." --note "..."
npm run review -- publish <id> --note "Checked the stored API fields." --confirm
npm run review -- reject <id> --note "Not relevant to this desk."
```

`start_review` and `return_to_draft` are also accepted. Write facts from fields you can see on the record. Keep interpretation in its own field. Do not invent dates, metrics, quotes, or citations.

## Export

Open Digest, select published records, and preview. Download links call:

```text
GET /api/export?format=md&ids=<id>,<id>
GET /api/export?format=html&ids=<id>,<id>
```

Repeated `ids` parameters are accepted as well. The handler loads each id again and drops anything that is not a published, non-fixture row. Omitted ids are named in the file with the reason. HTML is escaped and contains no script. Abstracts and release bodies are not included. Quay does not email the file.

## Static reading site

```bash
npm run export:pages
npm run snapshot:review
```

`export:pages` reads only `site/published.json`. `snapshot:review` writes gitignored `data/pages-candidate.json` from published, non-fixture rows. Copy approved records into `site/published.json` yourself. The Pages workflow deploys that file and does not open the database. Details, the base path, and the deploy commands are in [docs/pages-hosting.md](docs/pages-hosting.md).

## Upgrade

Replace the source files. Leave `data/quay.sqlite` and `data/editor-token` where they are. Opening the database creates `request_cache` if it is missing. Then:

```bash
npm install
npm test
```

Do not copy `data/` into the public GitHub repository.

## Data layout

| Path | Role |
| --- | --- |
| `data/quay.sqlite` | Records, review history, ingest runs. Gitignored. Override with `QUAY_DB_PATH`. |
| `data/editor-token` | Local bearer secret. Gitignored. |
| `data/pages-candidate.json` | Local candidate for the public snapshot. Gitignored. |
| `site/published.json` | Reviewed records the public site may build. Starts empty. |
| `pages-dist/` | Generated static site. Gitignored. |
| Browser `localStorage` key `quay.bookmarks.v1` | Saved records on this browser only. |
| Browser `localStorage` key `quay.timeMode.v1` | `utc` (default) or the browser time zone. |

Timestamps are stored as UTC. Unknown source dates stay unknown. The log can display a known instant in the browser zone without changing the stored value.

## Tests

```bash
npm test
npm run test:ui
npx eslint src scripts tests e2e
npx tsc --noEmit
npm run build
```

Unit tests use in-memory SQLite and do not read `data/quay.sqlite`. `npm run test:ui` starts its own desk on `127.0.0.1:43128` with a throwaway database. That database contains one draft and one fixture row forced to `published`. Neither title is allowed on the public log, in `/api/feed`, or in an export. The suite does not call arXiv or GitHub.

The UI tests expect an empty public log. Do not point them at a desk that already has published rows. `PLAYWRIGHT_BASE_URL` can target another empty local server, such as a fresh install on port 43127. In that mode the runner does not create a database and does not write fixtures into the server you named.

The component files under `src/components/ui` are part of the app. The `shadcn` CLI is not installed. Add a component later with `npx shadcn@latest`, then review the generated file. Do not add that CLI to `dependencies`. Its tree carried the deepmerge and ts-morph advisories. The Tailwind variants those primitives use (`data-checked`, `data-horizontal`, `data-vertical`) live in `src/app/globals.css`.

`package.json` pins `@typescript-eslint/typescript-estree`'s `minimatch` to 11.0.5, which is outside the affected range of GHSA-g3hv-75wg-m249. A separate `minimatch` 3.1.5 remains for older tooling. That 3.x line is outside the same advisory, which starts at 7.0.0. Do not "fix" the audit by downgrading `eslint-config-next` to 15 or `shadcn` to 1.0.0. Re-run `npm audit` after future installs. The result on 8 November 2026 is recorded in [docs/verification.md](docs/verification.md).

Exact results from the verification pass are in [docs/verification.md](docs/verification.md).

## Implemented and not implemented

Implemented:

- Responsive public log and detail pages for news, model, paper, repo, and tool records.
- Search, type, topic, and UTC date filters. Empty and no-match states.
- Browser-local bookmarks, labeled as local.
- Provenance, primary citations, and separate fact and interpretation sections.
- arXiv category ingestion for cs.AI, cs.CL, cs.CV, and cs.LG, and GitHub release ingestion for five allowlisted repositories, with canonical URL and stable-id deduplication, topic union, idempotent re-ingest, conditional GET, and title-similarity flags that do not auto-merge.
- A local `ingest:daily` command. It is not installed as cron and it is not a GitHub Actions job.
- A static Pages export from a reviewed JSON snapshot, with client-side search, filters, bookmarks, and digest download.
- Mandatory draft review. Public log and Markdown/HTML digest include published rows only.
- Local editor page and CLI. Unauthenticated mutations return `401`.
- Disabled adapters documented, with no network call.

Not implemented, on purpose:

- Email, newsletter delivery, signup, accounts, and analytics.
- A live adapter for news pages, model cards, OpenAlex, the Hugging Face Hub, the Hugging Face blog, OpenAI news, or the DeepMind blog.
- An automated ingest workflow. The daily command runs only when someone starts it, or when they add their own crontab.
- Seeded demo stories in the public database. Tests build fixture rows in temporary files. Those rows are labeled `origin=fixture` and cannot be published.
- Ranking, votes, subscriber counts, or a claim that the log is complete.

## Further notes

- Permissions and rate limits: [docs/source-permissions.md](docs/source-permissions.md)
- Request paths and dedup rules: [docs/architecture.md](docs/architecture.md)
- Research input: [docs/research-brief.md](docs/research-brief.md)
- Verification commands and limits: [docs/verification.md](docs/verification.md)
