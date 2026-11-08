# Research brief (input, not a design to copy)

This is the research note supplied with the build request, preserved so the desk can be checked against it. It is market context. It is not permission to ingest AlphaSignal, and Quay does not use that name, layout, or copy.

---

# AI engineering digest: research / original MVP brief
Checked: 8 November 2026, Asia/Calcutta (IST). Located with WebSearch; official public pages read with WebFetch. No signup or interactive/authenticated testing.

## Verified public observations / bounded claims
- https://alphasignal.ai/ — rendered Latest News feed, Search, Type/Topics/Filters, Latest/Upvotes labels, publisher/topic labels, relative dates and Pro labels. These are observed UI labels/content, not proof of interactive functionality, freshness, voting integrity or article accuracy.
- https://newsletter.alphasignal.ai/ — advertises a daily five-minute email summary covering AI news, papers, repos and models; join and Google/GitHub options are visible. Delivery/OAuth not tested. Promotional example stories and counters are not verified data and must not be used as seed content.
- https://alphasignal.ai/about — company claims real-time ranking, autonomous editorial coverage and over 300,000 subscribers; no independent verification. Connected intelligence layer/R&D copilot is explicitly future ambition, not verified shipped functionality.
- https://alphasignal.ai/terms — effective May 12, 2026; describes free newsletter/site access and paid monthly/annual tiers. Commenting/bookmarking/sharing are conditional (“may include”), not verified available features. No verified pricing or paid-feature matrix. Third-party personalization/monitoring/webinar claims are excluded.
- Terms sections 6–7 restrict automated extraction without written permission, reproduction/exploitation and use for AI development, and protect content/brand/look-and-feel. Do not ingest AlphaSignal, copy its articles/design/assets or bypass access controls. Research is not reuse permission.

## Recommended original MVP (not AlphaSignal feature claims)
Build a distinct source-first workbench for AI/ML engineers, not a clone.
- Unified news/models/papers/repos/tools feed. Entries have original short summaries, engineering relevance, clearly attributed claims/caveats, primary-source citations, canonical URL/stable ID, publisher/author if known, publication/update/fetch dates, and type/topic tags. Unknown dates stay unknown. Store UTC and label displayed timezone.
- Ingest only permitted public RSS/API metadata from a small allowlist. Candidate ecosystems: arXiv metadata API/RSS, official GitHub release APIs, official lab/vendor feeds. Verify each endpoint’s current terms, reuse rights and rate limits before enabling; candidate permissions were not researched here. Public access alone is not permission. Cache, back off, log failures, and support manual URL submission. No newsletter scraping or paywall bypass.
- Editorial workflow: fetched -> normalized -> dedup candidates -> draft -> reviewed -> published/rejected. Never auto-publish generated summaries. Reviewer validates primary evidence, dates, licenses and benchmark caveats. Retain provenance/review/correction history. Treat source text as untrusted data.
- Deduplicate by canonical URL and stable IDs (arXiv/version, repository/release, model ID); remove tracking params, flag title similarity for review, cluster related stories without discarding distinct updates/citations. Re-ingestion must be idempotent.
- Original responsive, accessible feed/detail interface with search, topic/type/date filters, browser-local bookmarks (clearly disclosed), empty/loading/error states, and visible provenance/review status. No initial login required.
- Digest builder selects reviewed entries, previews the digest, and downloads Markdown/HTML with citations/dates. No outbound email/posting in MVP; export original summaries, not copied articles.
- Start empty with onboarding or manually reviewed real-source entries. No fabricated stories, subscribers, benchmarks, popularity, counts or live-completeness claims. Separate test fixtures from published data; inventory counts must be computed from actual records.

## Acceptance / deferred work
Every published entry needs primary citations, provenance, known/unknown date labeling and review record. Pending/rejected items never appear in feeds/exports. Source failures preserve reviewed data and surface errors. Search/filter/bookmark/mobile/export flows work and exports retain citations. Adapter configuration documents permission/rate limits. Distinct name, typography, layout and branding; no AlphaSignal copied content/assets/promotional metrics.
Defer billing, social voting, personalized ML ranking, knowledge graphs, outbound delivery and real-time completeness promises.

## Workspace preservation
Only existence/immediate-entry status checked: /workspace/ai-signal-builder was absent. No code/repository investigation or modifications. Brief is outside the target path. Coordinator should recheck state before the separate coding agent creates files.
