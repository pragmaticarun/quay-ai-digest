import { describe, expect, it } from "vitest";
import { authorizeEditor } from "@/lib/auth";
import { parseArxivUrl, normalizeCanonicalUrl } from "@/lib/urls";

describe("canonical URLs", () => {
  it("strips tracking parameters and fragments", () => {
    const url = normalizeCanonicalUrl("https://Example.com/papers/a/?utm_source=x&b=2&fbclid=abc&gclid=1#section");
    expect(url).toBe("https://example.com/papers/a?b=2");
  });

  it("rejects non-http schemes and embedded credentials", () => {
    expect(normalizeCanonicalUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeCanonicalUrl("data:text/html,hi")).toBeNull();
    expect(normalizeCanonicalUrl("https://user:pass@example.com/a")).toBeNull();
  });

  it("canonicalizes arXiv abstract URLs and keeps the version", () => {
    const parsed = parseArxivUrl("http://arxiv.org/pdf/1234.56789v2.pdf");
    expect(parsed).toMatchObject({
      canonicalUrl: "https://arxiv.org/abs/1234.56789v2",
      stableId: "arxiv:1234.56789v2",
      baseId: "arxiv:1234.56789",
      versionLabel: "v2",
    });
  });
});

describe("editor authorization", () => {
  const token = "local-test-token";

  it("rejects a missing token", () => {
    const request = new Request("http://127.0.0.1:43127/api/editor/ingest");
    const result = authorizeEditor(request, token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("accepts the bearer token", () => {
    const request = new Request("http://127.0.0.1:43127/api/editor/ingest", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(authorizeEditor(request, token).ok).toBe(true);
  });

  it("rejects a cross-origin browser request", () => {
    const request = new Request("http://127.0.0.1:43127/api/editor/ingest", {
      headers: {
        authorization: `Bearer ${token}`,
        origin: "https://evil.example",
        host: "127.0.0.1:43127",
      },
    });
    const result = authorizeEditor(request, token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("rejects a token placed in the query string", () => {
    const request = new Request(`http://127.0.0.1:43127/api/editor/ingest?token=${token}`, {
      headers: { host: "127.0.0.1:43127" },
    });
    const result = authorizeEditor(request, token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});
