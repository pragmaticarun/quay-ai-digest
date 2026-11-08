import { describe, expect, it } from "vitest";
import { arxivCategoryUrl, fetchArxiv, mergeByStableId, parseArxivAtom } from "@/lib/adapters/arxiv";
import { fetchGithubReleases, parseGithubReleases } from "@/lib/adapters/github";
import { parseHuggingFaceModels } from "@/lib/adapters/huggingface-hub";
import { parseOpenAlexWorks } from "@/lib/adapters/openalex";
import { evaluateCooldown, adapters } from "@/lib/adapters/registry";
import { HUGGINGFACE_BLOG, parseRssFeed } from "@/lib/adapters/rss";
import { escapeHtml } from "@/lib/escape";
import { openDatabase } from "@/lib/db";
import { getEntry, ingestCandidate, listPublic, markAdapterSuccess } from "@/lib/entries";
import { runAdapter } from "@/lib/ingest";
import { putRequestCache } from "@/lib/request-cache";
import type { SourceCandidate } from "@/lib/types";

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/0000.00011v1</id>
    <title>FIXTURE  attention   routing</title>
    <summary>FIXTURE ABSTRACT NOT A REAL PAPER</summary>
    <published>2026-11-02T01:02:03Z</published>
    <updated>2026-11-02T01:02:03Z</updated>
    <author><name>Fixture A</name></author>
    <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
    <link href="http://arxiv.org/abs/0000.00011v1" rel="alternate" type="text/html"/>
    <link href="http://arxiv.org/pdf/0000.00011v1" rel="related" title="pdf" type="application/pdf"/>
  </entry>
</feed>`;

describe("source parsers", () => {
  it("parses arXiv metadata without treating the abstract as the editorial summary", () => {
    const parsed = parseArxivAtom(ATOM);
    expect(parsed.candidates).toHaveLength(1);
    const [candidate] = parsed.candidates;
    expect(candidate?.stableId).toBe("arxiv:0000.00011v1");
    expect(candidate?.title).toBe("FIXTURE attention routing");
    expect(candidate?.factSummary).not.toContain("FIXTURE ABSTRACT");
    expect(candidate?.sourceExcerpt).toContain("FIXTURE ABSTRACT");
    expect(candidate?.factSummaryKind).toBe("mechanical");
    expect(candidate?.topics).toContain("machine-learning");
    expect(candidate?.publishedAt).toBe("2026-11-02T01:02:03.000Z");
    expect(candidate?.citations.some((citation) => citation.role === "primary")).toBe(true);
  });

  it("refuses a doctype", () => {
    expect(() => parseArxivAtom("<!DOCTYPE foo [<!ENTITY xxe SYSTEM 'file:///etc/passwd'>]><feed></feed>")).toThrow(/doctype/i);
  });

  it("keeps GitHub release identifiers and drops the body", () => {
    const body = JSON.stringify([
      {
        id: 42,
        tag_name: "v9.9.9-fixture",
        name: "Fixture label",
        draft: false,
        prerelease: true,
        published_at: "2026-10-01T00:00:00Z",
        html_url: "https://github.com/pytorch/pytorch/releases/tag/v9.9.9-fixture?utm_source=test",
        body: "SECRET RELEASE NOTES should not be stored",
        author: { login: "octofix" },
      },
      { id: 43, tag_name: "draft-tag", draft: true, html_url: "https://github.com/pytorch/pytorch/releases/tag/draft-tag" },
    ]);
    const parsed = parseGithubReleases(body, { owner: "pytorch", repo: "pytorch", type: "repo", topics: ["pytorch", "releases"] }, "https://api.github.com/repos/pytorch/pytorch/releases?per_page=5");
    expect(parsed.candidates).toHaveLength(1);
    const [candidate] = parsed.candidates;
    expect(candidate?.stableId).toBe("github-release:42");
    expect(candidate?.canonicalUrl).toBe("https://github.com/pytorch/pytorch/releases/tag/v9.9.9-fixture");
    expect(candidate?.factSummary).toContain("prerelease is true");
    expect(JSON.stringify(candidate)).not.toContain("SECRET RELEASE NOTES");
    expect(candidate?.updatedAt).toBeNull();
    expect(parsed.skipped).toBe(1);
  });

  it("does not treat a GitHub updated_at or lastModified as the publication date", () => {
    const body = JSON.stringify([
      {
        id: 77,
        tag_name: "v0.0.1-fixture",
        draft: false,
        prerelease: false,
        published_at: "2026-10-01T00:00:00Z",
        updated_at: "2026-11-01T00:00:00Z",
        lastModified: "2026-11-02T00:00:00Z",
        html_url: "https://github.com/ggml-org/llama.cpp/releases/tag/v0.0.1-fixture",
        body: "do not store",
      },
    ]);
    const parsed = parseGithubReleases(
      body,
      { owner: "ggml-org", repo: "llama.cpp", type: "tool", topics: ["llama.cpp"] },
      "https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=5",
    );
    expect(parsed.candidates[0]?.publishedAt).toBe("2026-10-01T00:00:00.000Z");
    expect(parsed.candidates[0]?.updatedAt).toBeNull();
    expect(JSON.stringify(parsed.candidates[0])).not.toContain("do not store");
  });

  it("merges the same arXiv version from two categories into one candidate", () => {
    const first = parseArxivAtom(ATOM, "https://export.arxiv.org/api/query?search_query=cat:cs.LG").candidates[0];
    const secondXml = ATOM.replace("cs.LG", "cs.CL");
    const second = parseArxivAtom(secondXml, "https://export.arxiv.org/api/query?search_query=cat:cs.CL").candidates[0];
    expect(first && second).toBeTruthy();
    const merged = mergeByStableId([first!, { ...second!, topics: ["natural-language-processing"] }]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.topics).toEqual(expect.arrayContaining(["machine-learning", "natural-language-processing"]));
  });
});

describe("ingest guards", () => {
  it("keeps every registered adapter enabled and has no AlphaSignal adapter", () => {
    expect(adapters.filter((adapter) => !adapter.enabled)).toEqual([]);
    expect(adapters.map((adapter) => adapter.id)).toEqual([
      "arxiv",
      "github-releases",
      "openalex-works",
      "huggingface-hub",
      "huggingface-blog",
      "openai-news",
      "deepmind-blog",
    ]);
    expect(adapters.some((adapter) => /alphasignal/i.test(adapter.id + adapter.title))).toBe(false);
  });

  it("stops later GitHub repositories after HTTP 429 and does not mark success", async () => {
    const db = openDatabase(":memory:");
    const urls: string[] = [];
    const run = await runAdapter(db, "github-releases", {
      now: "2026-11-08T12:00:00.000Z",
      sleepImpl: async () => undefined,
      fetchImpl: async (url) => {
        urls.push(url);
        return new Response("{}", { status: 429, headers: { "retry-after": "60" } });
      },
    });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("pytorch/pytorch");
    expect(run.outcome).toBe("error");
    expect(run.message).toMatch(/429/);
  });

  it("treats GitHub 304 as not-modified and does not parse a body", async () => {
    const db = openDatabase(":memory:");
    const url = "https://api.github.com/repos/pytorch/pytorch/releases?per_page=5";
    putRequestCache(db, url, {
      etag: "W/\"fixture\"",
      lastModified: "Sat, 01 Nov 2026 00:00:00 GMT",
      fetchedAt: "2026-11-07T00:00:00.000Z",
      status: "ok",
    });
    let sentValidator = false;
    const fetched = await fetchGithubReleases(
      db,
      async (url, init) => {
        const headers = new Headers(init?.headers);
        if (url.includes("pytorch/pytorch")) sentValidator = headers.get("if-none-match") === "W/\"fixture\"";
        return { status: 304, headers: new Headers({ etag: "W/\"fixture\"" }), arrayBuffer: async () => new ArrayBuffer(0) } as Response;
      },
      async () => undefined,
      { now: "2026-11-08T12:00:00.000Z", force: true },
    );
    expect(sentValidator).toBe(true);
    expect(fetched.candidates).toHaveLength(0);
    expect(fetched.skipped).toBeGreaterThan(0);
    expect(fetched.halted).toBeNull();
  });

  it("skips a fresh cached arXiv URL and still requests a category without a cache row", async () => {
    const db = openDatabase(":memory:");
    const cached = arxivCategoryUrl("cs.AI");
    putRequestCache(db, cached, { etag: null, lastModified: null, fetchedAt: "2026-11-08T10:00:00.000Z", status: "ok" });
    const urls: string[] = [];
    await fetchArxiv(
      db,
      async (url) => {
        urls.push(url);
        return new Response(ATOM, { status: 200, headers: { "content-type": "application/atom+xml" } });
      },
      async () => undefined,
      { now: "2026-11-08T12:00:00.000Z" },
    );
    expect(urls.some((url) => url.includes("cat%3Acs.AI") || url.includes("cat:cs.AI"))).toBe(false);
    expect(urls.some((url) => url.includes("cs.CL"))).toBe(true);
  });

  it("does not repeat cs.LG on the same day when only an older adapter success exists", async () => {
    const db = openDatabase(":memory:");
    markAdapterSuccess(db, "arxiv", "2026-11-08T11:31:50.000Z");
    const urls: string[] = [];
    await fetchArxiv(
      db,
      async (url) => {
        urls.push(url);
        return new Response(ATOM, { status: 200 });
      },
      async () => undefined,
      { now: "2026-11-08T12:40:00.000Z" },
    );
    expect(urls.some((url) => url.includes("cs.LG"))).toBe(false);
    expect(urls.some((url) => url.includes("cs.CL"))).toBe(true);
  });

  it("unions topics when the same paper is ingested from a second category", () => {
    const db = openDatabase(":memory:");
    const now = "2026-11-08T12:00:00.000Z";
    const first = parseArxivAtom(ATOM).candidates[0];
    const second = parseArxivAtom(ATOM.replace("cs.LG", "cs.CL")).candidates[0];
    expect(first && second).toBeTruthy();
    ingestCandidate(db, first!, now);
    const again = ingestCandidate(db, { ...second!, topics: ["natural-language-processing"] }, now);
    expect(again.kind).toBe("updated");
    const entry = getEntry(db, again.id);
    expect(entry?.topics).toEqual(expect.arrayContaining(["machine-learning", "natural-language-processing"]));
    const version = ingestCandidate(
      db,
      { ...(first as SourceCandidate), stableId: "arxiv:0000.00011v2", versionLabel: "v2", canonicalUrl: "https://arxiv.org/abs/0000.00011v2" },
      now,
    );
    expect(version.kind).toBe("created");
    expect(version.id).not.toBe(again.id);
  });

  it("parses a feed item without storing the description and without using a decoy date", () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title><![CDATA[Fixture <script>alert(1)</script> &amp; more]]></title>
    <link>https://huggingface.co/blog/fixture-post</link>
    <guid>https://huggingface.co/blog/fixture-post</guid>
    <pubDate>Fri, 06 Nov 2026 14:00:48 GMT</pubDate>
    <updated>2020-01-01T00:00:00Z</updated>
    <description>SECRET DESCRIPTION BODY</description>
  </item>
  <item>
    <title>Fixture duplicate</title>
    <link>https://huggingface.co/blog/fixture-post</link>
    <guid>https://huggingface.co/blog/fixture-post</guid>
    <pubDate>Fri, 06 Nov 2026 14:00:48 GMT</pubDate>
  </item>
  <item>
    <title>Off host</title>
    <link>https://example.com/blog/nope</link>
    <pubDate>Fri, 06 Nov 2026 14:00:48 GMT</pubDate>
  </item>
</channel></rss>`;
    const parsed = parseRssFeed(xml, HUGGINGFACE_BLOG);
    expect(parsed.candidates).toHaveLength(1);
    expect(parsed.skipped).toBe(2);
    const [candidate] = parsed.candidates;
    expect(candidate?.publishedAt).toBe("2026-11-06T14:00:48.000Z");
    expect(candidate?.updatedAt).toBeNull();
    expect(candidate?.title).not.toMatch(/<script/i);
    expect(escapeHtml(candidate?.title ?? "")).not.toContain("<script");
    expect(JSON.stringify(candidate)).not.toContain("SECRET DESCRIPTION");
    expect(JSON.stringify(candidate)).not.toContain("2020-01-01");
  });

  it("refuses a feed doctype", () => {
    expect(() => parseRssFeed("<!DOCTYPE foo [<!ENTITY xxe SYSTEM 'file:///etc/passwd'>]><rss></rss>", HUGGINGFACE_BLOG)).toThrow(/doctype/i);
  });

  it("stores Hub lastModified as a catalog update and not as a publication date", () => {
    const body = JSON.stringify([
      {
        id: "fixture-org/fixture-model",
        private: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        lastModified: "2026-11-08T13:07:19.000Z",
        pipeline_tag: "text-generation",
        library_name: "transformers",
        cardData: "SECRET MODEL CARD",
        readme: "SECRET README",
      },
      { id: "fixture-org/private-model", private: true, lastModified: "2026-11-08T00:00:00.000Z" },
      { id: "../escape", private: false, lastModified: "2026-11-08T00:00:00.000Z" },
    ]);
    const parsed = parseHuggingFaceModels(body, "https://huggingface.co/api/models?limit=5");
    expect(parsed.candidates).toHaveLength(1);
    const [candidate] = parsed.candidates;
    expect(candidate?.publishedAt).toBeNull();
    expect(candidate?.datePrecision).toBe("unknown");
    expect(candidate?.updatedAt).toBe("2026-11-08T13:07:19.000Z");
    expect(candidate?.stableId).toBe("hf-model:fixture-org/fixture-model");
    expect(JSON.stringify(candidate)).not.toContain("SECRET MODEL CARD");
    expect(JSON.stringify(candidate)).not.toContain("SECRET README");
    expect(candidate?.factSummary).toContain("not stored as publishedAt");
  });

  it("keeps OpenAlex publication_date distinct from the catalog update and drops the abstract", () => {
    const body = JSON.stringify({
      results: [
        {
          id: "https://openalex.org/W1",
          display_name: "Fixture <script>alert(1)</script> paper",
          publication_date: "2026-11-01",
          updated_date: "2026-11-08T10:00:00.000Z",
          type: "preprint",
          doi: "https://doi.org/10.1000/fixture",
          abstract_inverted_index: { SECRET: [0], ABSTRACT: [1] },
          authorships: [{ author: { display_name: "A Person" } }],
          primary_location: { source: { display_name: "Fixture venue" }, landing_page_url: "https://example.com/secret-landing", pdf_url: "https://example.com/secret.pdf" },
        },
        { id: "https://openalex.org/W1", display_name: "duplicate", publication_date: "2026-11-01", type: "article" },
        { id: "https://evil.example/W9", display_name: "wrong host", publication_date: "2026-11-01", type: "article" },
      ],
    });
    const parsed = parseOpenAlexWorks(body, "https://api.openalex.org/works");
    expect(parsed.candidates).toHaveLength(1);
    const [candidate] = parsed.candidates;
    expect(candidate?.publishedAt).toBe("2026-11-01T00:00:00.000Z");
    expect(candidate?.datePrecision).toBe("date");
    expect(candidate?.updatedAt).toBe("2026-11-08T10:00:00.000Z");
    expect(candidate?.canonicalUrl).toBe("https://doi.org/10.1000/fixture");
    expect(candidate?.title).not.toMatch(/<script/i);
    expect(escapeHtml(candidate?.title ?? "")).not.toContain("<script");
    const encoded = JSON.stringify(candidate);
    expect(encoded).not.toContain("SECRET");
    expect(encoded).not.toContain("secret-landing");
    expect(encoded).not.toContain("secret.pdf");
    expect(candidate?.citations.some((citation) => citation.role === "primary" && citation.url === "https://doi.org/10.1000/fixture")).toBe(true);
  });

  it("stores a new feed draft and does not publish it", async () => {
    const db = openDatabase(":memory:");
    const run = await runAdapter(db, "openai-news", {
      now: "2026-11-08T12:00:00.000Z",
      sleepImpl: async () => undefined,
      fetchImpl: async () =>
        new Response(
          `<?xml version="1.0"?><rss><channel><item><title>Fixture news</title><link>https://openai.com/index/fixture</link><pubDate>Fri, 06 Nov 2026 08:00:00 GMT</pubDate><description>SECRET DESCRIPTION</description></item></channel></rss>`,
          { status: 200 },
        ),
    });
    expect(run.outcome).toBe("ok");
    expect(run.createdCount).toBe(1);
    expect(listPublic(db)).toEqual([]);
    const row = db.prepare("SELECT status, origin FROM entries").get() as { status: string; origin: string };
    expect(row).toEqual({ status: "draft", origin: "live" });
  });

  it("stops a feed adapter on HTTP 429 and does not mark success", async () => {
    const db = openDatabase(":memory:");
    const run = await runAdapter(db, "deepmind-blog", {
      now: "2026-11-08T12:00:00.000Z",
      sleepImpl: async () => undefined,
      fetchImpl: async () => new Response("slow", { status: 429, headers: { "retry-after": "30" } }),
    });
    expect(run.outcome).toBe("error");
    expect(run.message).toMatch(/429/);
    expect(run.createdCount).toBe(0);
  });

  it("treats a feed 304 as not-modified", async () => {
    const db = openDatabase(":memory:");
    putRequestCache(db, "https://huggingface.co/blog/feed.xml", {
      etag: "W/\"feed\"",
      lastModified: null,
      fetchedAt: "2026-11-07T00:00:00.000Z",
      status: "ok",
    });
    let sawValidator = false;
    const run = await runAdapter(db, "huggingface-blog", {
      now: "2026-11-08T12:00:00.000Z",
      force: true,
      sleepImpl: async () => undefined,
      fetchImpl: async (_url, init) => {
        sawValidator = new Headers(init?.headers).get("if-none-match") === "W/\"feed\"";
        return { status: 304, headers: new Headers({ etag: "W/\"feed\"" }), arrayBuffer: async () => new ArrayBuffer(0) } as Response;
      },
    });
    expect(sawValidator).toBe(true);
    expect(run.outcome).toBe("ok");
    expect(run.createdCount).toBe(0);
  });

  it("refuses an unforced repeat inside the cache window", () => {
    const gate = evaluateCooldown("2026-11-08T00:00:00.000Z", "2026-11-08T01:00:00.000Z", 12 * 60 * 60 * 1000, false);
    expect(gate.ok).toBe(false);
    const forced = evaluateCooldown("2026-11-08T00:00:00.000Z", "2026-11-08T01:00:00.000Z", 12 * 60 * 60 * 1000, true);
    expect(forced.ok).toBe(true);
  });
});
