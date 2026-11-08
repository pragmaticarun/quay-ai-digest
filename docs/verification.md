# Verification

Follow-up recorded 8 November 2026. Commands in this section ran from the project root on Node.js v22.23.4 and npm 10.9.9. They used throwaway databases. They did not read or change `data/quay.sqlite`, call arXiv or GitHub, send email, or deploy the desk.

A coordinator install of the previous archive at `/workspace/ai-signal-builder` is a separate tree. This follow-up did not write that path. The corrected archive is the installable copy.

## What changed

- Browser tests no longer require a published "XStack" row or any other record from a previous machine. They expect an empty public log.
- `npm run test:ui` prepares a temporary SQLite file, then starts Next on `127.0.0.1:43128` with `QUAY_DB_PATH` pointed at that file. The file holds one live draft and one `origin=fixture` row whose status was forced to `published` in SQL. The public log, `/api/feed`, and the HTML export must not show either title. The fixture is not published through the editor, and the file is outside `data/`.
- `PLAYWRIGHT_BASE_URL` still targets a server you already started. The runner does not create a database in that mode and does not write into that server. The public log on that server must be empty. A fresh install satisfies that.
- Bookmarks are checked by writing `localStorage` key `quay.bookmarks.v1` and reloading. The test does not need a published row and does not skip.
- The `shadcn` CLI was removed from `dependencies`. The app does not import it. `npm install` removed 164 packages from that tree, including `deepmerge` (GHSA-gcqx-w48m-w2h4) and the `ts-morph` / `minimatch` 10.2.6 copy under `@ts-morph/common`. The `data-checked`, `data-horizontal`, and `data-vertical` Tailwind variants used by the local primitives are now in `src/app/globals.css`.
- `package.json` `overrides` pins only `@typescript-eslint/typescript-estree` → `minimatch` 11.0.5. GHSA-g3hv-75wg-m249 covers minimatch `>=7.0.0 <11.0.1`. npm's suggested repairs were `shadcn@1.0.0` and `eslint-config-next@15.5.29`. Those are major downgrades away from the installed Next 16 line and were not applied. `npm audit fix` was not run.

## This run

`npx vitest run`:

```text
Test Files  3 passed (3)
     Tests  19 passed (19)
```

`npx eslint src scripts tests e2e` exited 0. `npx tsc --noEmit` exited 0.

`NEXT_TELEMETRY_DISABLED=1 npx next build` (Next.js 16.4.5, Turbopack) compiled successfully after the stylesheet change, finished TypeScript, and exited 0. `node:sqlite` printed its experimental warning while collecting page data. Route list was unchanged: `/`, `/digest`, `/items/[id]`, `/sources`, and the feed, export, and editor APIs are dynamic; `/about`, `/editor`, and `/icon.svg` are static.

`npx playwright test` with `PLAYWRIGHT_BASE_URL` unset, against the throwaway database on port 43128:

```text
✓ an empty public log explains itself and hides fixtures and drafts
✓ filters report an empty match
✓ sources page records disabled adapters
✓ editor requires a token and mutations are not public
✓ a browser-local bookmark survives reload without a published row
✓ export omits unknown ids and stays free of scripts
6 passed (5.5s)
```

No test was skipped. The first test read the temporary database and required both seeded rows to exist, including the fixture with status `published`, then required the rendered log to say "Nothing has been published." and to omit both titles.

A second server was started with a new empty file, `/tmp/quay-empty-install/desk.sqlite`, on `127.0.0.1:43129`. `GET /api/feed` returned `{"entries":[],"count":0}`. Then:

```text
PLAYWRIGHT_BASE_URL=http://127.0.0.1:43129 npx playwright test
6 passed (2.4s)
```

That is the same shape as the coordinator command against a clean install. Afterward the empty file still had 0 entries. `data/quay.sqlite` on this machine was unchanged: 13 live drafts and 5 live published rows. Those rows are not part of the archive and are not required by the tests.

`npm audit --json` exited 0:

```text
info 0, low 0, moderate 0, high 0, critical 0, total 0
```

Installed minimatch copies after the override: 11.0.5 under `@typescript-eslint/typescript-estree`, and 3.1.5 at `node_modules/minimatch`. `shadcn` and `deepmerge` are absent.

## Security limitations that remain

- This audit result is the registry state on 8 November 2026 for this lockfile. It is not a promise about later advisories. Run `npm audit` again after any install.
- The check above used npm 10.9.9. The coordinator's earlier audit used npm 11.21.1. The lockfile records the override, and both npm versions honor `overrides`, but this environment did not re-execute the suite on Node 24.
- `minimatch` 3.1.5 is still installed for older packages that declare the 3.x line. GHSA-g3hv-75wg-m249 does not include 3.x. A blanket override of every `minimatch` to 11 would change that API for those packages, so it was not applied. If a later advisory covers 3.x, the override needs another pass.
- Removing the CLI means `npx shadcn@latest` is an explicit, separate command. Do not commit its install back into `dependencies` to silence a missing import. The app build does not need the package.
- `node:sqlite` is still experimental on Node 22 and prints a warning. That is unchanged.
- No high or critical findings were in the coordinator's audit. The 13 entries were two advisories (deepmerge prototype pollution, minimatch glob amplification) counted once per dependent package. Both are cleared in this lockfile by the removal and the scoped override, not by a major downgrade.

## Earlier populated desk

The previous verification on this machine ingested arXiv and GitHub metadata and published five reviewed rows. That database is gitignored. Browser screenshots from that pass show a populated log. They are not evidence about a fresh archive install. The fresh-install screenshots from this follow-up are `quay-empty-desktop-feed.png` and `quay-empty-mobile-feed.png`.

## Delivered files

- `/opt/cursor/artifacts/quay-verification-report.md`
- `/opt/cursor/artifacts/quay-ledger-source.tar.gz`
- `/opt/cursor/artifacts/quay-empty-desktop-feed.png`
- `/opt/cursor/artifacts/quay-empty-mobile-feed.png`

Earlier screenshots of the populated desk remain beside those files. The archive excludes `.git`, `node_modules`, `.next`, `data`, `agent-tools`, `uploads`, Playwright output, `e2e/.isolated-db-path`, `pages-dist`, `e2e/pages-dist`, and `*.tar.gz`.

## Sources and Pages, 8 November 2026

A later pass on the same Node.js v22.23.4 / npm 10.9.9 tree added the category and repository expansion, the daily command, and the static Pages build. Counts below are from this machine's private database. Titles and abstracts stay in that database and are not copied here.

`npx vitest run`: 4 files, 31 tests, all passed. The new cases cover Atom doctype refusal, GitHub body dropping, `updated_at` not becoming a publication date, cross-category merge, topic union on re-ingest, a separate version row, HTTP 429 stopping later repositories, HTTP 304 without parsing a body, a fresh URL cache, the same-day `cs.LG` skip, disabled Hugging Face, OpenAI, and DeepMind adapters, and a Pages snapshot that rejects excerpts, review notes, tokens, drafts, and fixtures.

`npx eslint src scripts tests e2e` exited 0. `npx tsc --noEmit` exited 0. `npm run build` exited 0. `npm audit` remained 0 findings.

`npx playwright test`: 6 passed. `npx playwright test -c playwright.static.config.ts`: 1 passed against a synthetic fixture site, not against `site/published.json`.

`npm run export:pages` with `QUAY_PAGES_BASE=/quay-ai-digest` wrote 0 records. The HTML says "Nothing has been published."

`npm run ingest:daily` at 2026-11-08T12:31:48Z called the enabled adapters only. arXiv returned HTTP 200: 14 candidates, 9 new drafts, 5 unchanged, 1 category skipped (the same-day `cs.LG` cache). GitHub returned HTTP 200: 25 candidates, 15 new drafts, 10 unchanged. The private database then held 37 live drafts and the same 5 published rows. No new row was published. `site/published.json` stayed `{ "records": [] }`.

`gh auth status` on this machine is not logged in. The public repository was not pushed from here. Deployment commands are in [pages-hosting.md](pages-hosting.md).
