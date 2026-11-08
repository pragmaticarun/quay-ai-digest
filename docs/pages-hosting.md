# GitHub Pages

The editorial desk stays on the machine that holds `data/quay.sqlite` and `data/editor-token`. GitHub Pages serves a static reading copy. It cannot run Next.js, the API, or SQLite.

## What is public

`site/published.json` is the only record file the public build reads. It starts as `{ "records": [] }`. An empty log is an honest state.

```bash
npm run export:pages
```

That command reads `site/published.json`, never the database, and writes `pages-dist/`. The output is gitignored. It contains `index.html`, digest, sources, about, one folder per record, `snapshot.json`, `assets/desk.css`, `assets/desk.js`, `404.html`, and `.nojekyll`. Search, type, topic, and UTC date filters run in the browser. Bookmarks use `localStorage` key `quay.bookmarks.v1`. Digest preview and Markdown or HTML download are built in the browser. There is no account and no tracking pixel.

A project site needs a base path. The workflow sets `QUAY_PAGES_BASE=/quay-ai-digest`, so links look like `/quay-ai-digest/items/<id>/`. A user site, or a local server at the root, uses an empty base:

```bash
QUAY_PAGES_BASE= npm run export:pages -- --base ""
```

The base must be a slash-prefixed path. `..` and a scheme are rejected.

## What stays private

Do not commit `data/`, the editor token, drafts, fixtures, source excerpts, review notes, request URLs, or a database. The snapshot checker refuses a record that carries those fields, a draft or rejected status, or `origin: fixture`.

To prepare a candidate from the local database:

```bash
npm run snapshot:review
```

That writes `data/pages-candidate.json` only. Read it. If every record is one you intend to publish, copy those records into `site/published.json` and commit that file. The command does not overwrite `site/published.json` and it does not deploy.

The published feed can stay empty. Local publication does not appear on Pages until that file changes.

## Workflow

`.github/workflows/pages.yml` runs on a push to `main` and on `workflow_dispatch`. Permissions are `contents: read`, `pages: write`, and `id-token: write`. It checks out the repository, runs `npm ci`, builds with `QUAY_PAGES_BASE=/quay-ai-digest` from `site/published.json`, and deploys the artifact with the GitHub Pages actions. It has no secrets and it does not ingest.

There is no Actions workflow for daily ingest. Unreviewed drafts must not enter this repository, an Actions log, or a Pages artifact. The daily command in [source-permissions.md](source-permissions.md) stays on the private machine.

## Deploy

The public repository is https://github.com/pragmaticarun/quay-ai-digest. The reading site, after Pages is configured for the workflow, is https://pragmaticarun.github.io/quay-ai-digest/.

This working tree does not contain a GitHub credential. Do not copy a token into the tree to work around that. On a machine where `gh` is already authenticated as the owner:

```bash
# From a copy of this source that does not include data/, node_modules, or .next
git init
git add .
git commit -m "Publish the empty reviewed snapshot and the Pages workflow."
git branch -M main
git remote add origin https://github.com/pragmaticarun/quay-ai-digest.git
git push -u origin main
gh api --method POST repos/pragmaticarun/quay-ai-digest/pages --input - <<'JSON'
{"build_type":"workflow"}
JSON
gh run list --repo pragmaticarun/quay-ai-digest --workflow pages
gh run watch --repo pragmaticarun/quay-ai-digest
```

Then open https://pragmaticarun.github.io/quay-ai-digest/ and confirm the log says nothing has been published. A later push of an approved `site/published.json` is what adds records.
