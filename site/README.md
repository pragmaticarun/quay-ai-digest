# Reviewed snapshot

`published.json` is the only record data the public site build reads. It starts empty.

A local command can write a candidate from the private database:

```bash
npm run snapshot:review
```

That writes `data/pages-candidate.json`, which is gitignored. Read it. If every record is one you intend to publish, copy the records into this file and commit it. Do not commit the database, the editor token, drafts, fixtures, or source excerpts.

The Pages workflow builds HTML from this file. It does not open SQLite and it does not fetch sources.
