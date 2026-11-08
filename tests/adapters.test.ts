import { describe, expect, it } from "vitest";
import { arxivCategoryUrl, fetchArxiv, mergeByStableId, parseArxivAtom } from "@/lib/adapters/arxiv";
import { fetchGithubReleases, parseGithubReleases } from "@/lib/adapters/github";
import { evaluateCooldown } from "@/lib/adapters/registry";
import { openDatabase } from "@/lib/db";
import { getEntry, ingestCandidate, markAdapterSuccess } from "@/lib/entries";
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
  it("does not call the network for a disabled adapter", async () => {
    const db = openDatabase(":memory:");
    let called = false;
    const run = await runAdapter(db, "openalex-works", {
      fetchImpl: async () => {
        called = true;
        throw new Error("should not fetch");
      },
    });
    expect(called).toBe(false);
    expect(run.outcome).toBe("skipped");
    expect(run.message).toMatch(/written consent|conflict/i);
  });

  it("does not call disabled Hugging Face, OpenAI, or DeepMind adapters", async () => {
    const db = openDatabase(":memory:");
    let called = false;
    const fetchImpl = async () => {
      called = true;
      throw new Error("should not fetch");
    };
    for (const id of ["huggingface-hub", "huggingface-blog", "openai-news", "deepmind-blog"]) {
      const run = await runAdapter(db, id, { fetchImpl });
      expect(run.outcome).toBe("skipped");
    }
    expect(called).toBe(false);
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

  it("refuses an unforced repeat inside the cache window", () => {
    const gate = evaluateCooldown("2026-11-08T00:00:00.000Z", "2026-11-08T01:00:00.000Z", 12 * 60 * 60 * 1000, false);
    expect(gate.ok).toBe(false);
    const forced = evaluateCooldown("2026-11-08T00:00:00.000Z", "2026-11-08T01:00:00.000Z", 12 * 60 * 60 * 1000, true);
    expect(forced.ok).toBe(true);
  });
});
