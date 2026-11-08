# Architecture

Quay is a local Next.js app. The public log is read-only. Editorial changes go through route handlers that require a local bearer token. There is no account system, no email, and no background poller.

## Request paths

- `GET /` and `GET /items/[id]` render published, non-fixture rows from SQLite.
- `GET /digest` lists those same rows. Download links call `GET /api/export`, which loads the ids again and drops anything that is not published.
- `GET /sources` prints the adapter registry and the latest ingest runs. It does not print draft titles.
- `/editor` is a browser page. It keeps the editor token in `sessionStorage` and sends `Authorization: Bearer`. The token is not written into the HTML.
- `POST /api/editor/ingest`, `POST /api/editor/items`, `PATCH` and `POST /api/editor/items/[id]` call `authorizeEditor`. A missing or wrong token is 401. A browser `Origin` whose host does not match `Host` is 403. A token in the query string is 400. No CORS headers are set.

The same review functions are available from `npm run ingest` and `npm run review` on the machine that has the database file. Those commands do not listen on a port.

## Records

SQLite (`node:sqlite`) lives at `data/quay.sqlite` unless `QUAY_DB_PATH` is set. The file is gitignored.

An ingested candidate moves through history events `fetched`, `normalized`, `dedup-checked`, and `drafted` in one transaction. The stored status is `draft`. Later actions are `in_review`, `published`, `rejected`, and `returned-to-draft`. Ingestion never sets `published`.

Identity:

- Canonical URL: `http` or `https` only, no credentials, no fragment, tracking parameters removed, host lowercased by the URL parser. arXiv hosts are rewritten to `https://arxiv.org/abs/{id}`.
- Stable id: `arxiv:{id}{version}`, `github-release:{numeric id}`, `openalex:{work id}`, `hf-model:{model id}`, `{rss-adapter}:{canonical URL}`, or `manual:{hash of canonical URL}`.
- The same stable id or the same canonical URL updates one row. A canonical URL that already belongs to a different stable id is a conflict and is not inserted.
- The same arXiv stable id returned by more than one category is one row. Topics are unioned, including when a later response lists a narrower set.
- A new arXiv version or a new GitHub tag is a new row. Rows that share a base id are linked. They are not collapsed.
- Title-token overlap at or above 0.8, on different base ids, is stored as a similarity flag for the editor. Nothing is merged automatically.
- Re-ingestion of an identical source hash only records `reingest-unchanged`.
- If an editor has written the factual summary, or the row is in review, published, or rejected, a changed source is stored as a pending snapshot and the displayed text stays put until the editor applies it.

Publishing requires a factual summary of at least 40 characters that was saved by an editor, one primary `http` or `https` citation, a review note of at least 8 characters, and `confirmReviewed: true`. Fixture rows cannot be published. The public query also excludes `origin = fixture` and any status other than `published`, so a bad write still does not leak.

## Untrusted text

Source titles, abstracts, and release labels are rendered as React text, not HTML. Export HTML escapes text and only emits links that pass the same URL normalizer. Digest files contain the editorial sections and citations. They do not contain stored abstracts or release bodies.

## Time

Timestamps are stored as UTC ISO strings. Unknown or unparseable source dates stay unknown, with the raw source string kept for the editor. The public pages say which precision was stored. A browser control can format a known instant in the browser's time zone after load. The stored value does not change.

## Two copies

The Next.js app is the private desk. GitHub Pages gets a second, static copy built by `src/lib/pages-export.ts` from `site/published.json`. That build does not open SQLite. `npm run snapshot:review` can write a gitignored candidate from published non-fixture rows. A person copies approved records into `site/published.json`. The public record type omits excerpts, review notes, request URLs, pending source payloads, content hashes, and origin. See [pages-hosting.md](pages-hosting.md).

Request URLs that succeeded are cached in `request_cache` for 20 hours. That table is created on open if an older database does not have it. The cache stays in the private SQLite file.

## What is intentionally absent

Billing, accounts, email delivery, voting, personalized ranking, a knowledge graph, and a claim that the log is complete. News and model types exist so an editor can file a hand-checked citation. No adapter is enabled for them.
