const TRACKING_KEYS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "ref_src",
  "yclid",
  "msclkid",
  "_ga",
  "si",
]);

export function normalizeCanonicalUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname || url.hostname.includes(" ")) return null;

  url.hash = "";
  const kept: [string, string][] = [];
  for (const [key, value] of url.searchParams.entries()) {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_") || TRACKING_KEYS.has(lower)) continue;
    kept.push([key, value]);
  }
  kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  const next = new URLSearchParams();
  for (const [key, value] of kept) next.append(key, value);
  url.search = next.toString();

  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  if (url.hostname.toLowerCase() === "arxiv.org" || url.hostname.toLowerCase() === "www.arxiv.org") {
    url.protocol = "https:";
    url.hostname = "arxiv.org";
  }

  return url.toString();
}

const ARXIV_ID = /^((?:\d{4}\.\d{4,5})|(?:[a-z-]+(?:\.[A-Z]{2})?\/\d{7}))(v\d+)?$/i;

export function parseArxivUrl(input: string): {
  canonicalUrl: string;
  stableId: string;
  baseId: string;
  versionLabel: string | null;
  arxivId: string;
} | null {
  const normalized = normalizeCanonicalUrl(input);
  if (!normalized) return null;
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }
  if (url.hostname !== "arxiv.org") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const head = parts[0]?.toLowerCase();
  if (head !== "abs" && head !== "pdf" && head !== "html") return null;
  const rawId = decodeURIComponent(parts.slice(1).join("/")).replace(/\.pdf$/i, "");
  const match = ARXIV_ID.exec(rawId);
  if (!match) return null;
  const base = match[1];
  const version = match[2] ?? null;
  const arxivId = `${base}${version ?? ""}`;
  const canonicalUrl = `https://arxiv.org/abs/${arxivId}`;
  return {
    canonicalUrl,
    stableId: `arxiv:${arxivId}`,
    baseId: `arxiv:${base}`,
    versionLabel: version,
    arxivId,
  };
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
