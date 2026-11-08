import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { tokensEqual } from "@/lib/secret";

export function editorTokenPath(): string {
  return path.join(process.cwd(), "data", "editor-token");
}

export function ensureEditorToken(): string {
  const fromEnv = process.env.QUAY_EDITOR_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const file = editorTokenPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing) return existing;
  }
  const token = randomBytes(32).toString("hex");
  fs.writeFileSync(file, `${token}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Some filesystems ignore chmod. The file is still gitignored.
  }
  return token;
}

export type AuthResult = { ok: true } | { ok: false; status: number; error: string };

export function authorizeEditor(request: Request, expectedToken: string, bodyToken?: string | null): AuthResult {
  const url = new URL(request.url);
  for (const key of url.searchParams.keys()) {
    const lower = key.toLowerCase();
    if (lower === "token" || lower === "authorization" || lower === "editor_token") {
      return { ok: false, status: 400, error: "Do not put the editor token in the URL." };
    }
  }

  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("host");
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      return { ok: false, status: 403, error: "The editor rejected a malformed Origin header." };
    }
    if (!host || originHost !== host) {
      return { ok: false, status: 403, error: "Cross-origin editor requests are rejected." };
    }
  }

  const header = request.headers.get("authorization") ?? "";
  let presented = "";
  if (header.toLowerCase().startsWith("bearer ")) presented = header.slice(7).trim();
  if (!presented && bodyToken) presented = bodyToken.trim();
  if (!presented || !tokensEqual(presented, expectedToken)) {
    return { ok: false, status: 401, error: "Editor token required." };
  }
  return { ok: true };
}
