import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@playwright/test";
import { DRAFT_TITLE, FIXTURE_TITLE } from "./titles";

function isolatedDatabase(): string | null {
  const marker = path.join(process.cwd(), "e2e", ".isolated-db-path");
  if (!fs.existsSync(marker)) return null;
  const dbPath = fs.readFileSync(marker, "utf8").trim();
  return dbPath || null;
}

test("an empty public log explains itself and hides fixtures and drafts", async ({ page, request }) => {
  const dbPath = process.env.PLAYWRIGHT_BASE_URL ? null : isolatedDatabase();
  if (!process.env.PLAYWRIGHT_BASE_URL) {
    expect(dbPath, "the isolated browser server did not record its database path").toBeTruthy();
  }
  if (dbPath) {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db.prepare("SELECT title, origin, status FROM entries ORDER BY title").all() as {
      title: string;
      origin: string;
      status: string;
    }[];
    db.close();
    expect(rows).toEqual([
      { title: FIXTURE_TITLE, origin: "fixture", status: "published" },
      { title: DRAFT_TITLE, origin: "live", status: "draft" },
    ]);
  }

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Quay" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Public log" })).toBeVisible();
  await expect(page.getByLabel("Search")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nothing has been published." })).toBeVisible();
  await expect(page.getByText("Showing 0 published records.")).toBeVisible();
  await expect(page.getByText("Bookmarks stay in this browser's local storage")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save on this browser" })).toHaveCount(0);
  await expect(page.getByText(FIXTURE_TITLE)).toHaveCount(0);
  await expect(page.getByText(DRAFT_TITLE)).toHaveCount(0);
  await expect(page.getByText(/AlphaSignal/i)).toHaveCount(0);

  const feed = await request.get("/api/feed");
  expect(feed.ok()).toBeTruthy();
  const body = (await feed.json()) as { count: number; entries: { title: string }[] };
  expect(body.count).toBe(0);
  expect(body.entries).toEqual([]);
});

test("filters report an empty match", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Search").fill("query-that-matches-nothing-quay");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Showing 0 published records matching these filters.")).toBeVisible();
  await expect(page.getByText(FIXTURE_TITLE)).toHaveCount(0);
});

test("sources page lists every registered adapter as enabled", async ({ page }) => {
  await page.goto("/sources");
  await expect(page.getByRole("heading", { name: "Source allowlist" })).toBeVisible();
  await expect(page.getByText("arXiv API (cs.AI, cs.CL, cs.CV, cs.LG)").first()).toBeVisible();
  await expect(page.getByText("OpenAlex works API").first()).toBeVisible();
  await expect(page.getByText("Hugging Face Hub model API").first()).toBeVisible();
  await expect(page.getByText("Hugging Face blog RSS").first()).toBeVisible();
  await expect(page.getByText("OpenAI news RSS").first()).toBeVisible();
  await expect(page.getByText("Google DeepMind blog RSS").first()).toBeVisible();
  await expect(page.getByText(/operator accepted responsibility/i).first()).toBeVisible();
  await expect(page.getByText(/Why it is off/i)).toHaveCount(0);
  await expect(page.getByText(/AlphaSignal/i)).toHaveCount(0);
});

test("editor requires a token and mutations are not public", async ({ page, request }) => {
  await page.goto("/editor");
  await expect(page.getByLabel("Editor token")).toBeVisible();
  const response = await request.post("/api/editor/ingest", {
    data: { adapterId: "arxiv" },
  });
  expect(response.status()).toBe(401);
});

test("a browser-local bookmark survives reload without a published row", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("0 saved here.")).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem("quay.bookmarks.v1", JSON.stringify(["local-only-bookmark"]));
  });
  await page.reload();
  await expect(page.getByText("1 saved here.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nothing has been published." })).toBeVisible();
  const stored = await page.evaluate(() => localStorage.getItem("quay.bookmarks.v1"));
  expect(stored).toBe(JSON.stringify(["local-only-bookmark"]));
});

test("export omits unknown ids and stays free of scripts", async ({ request }) => {
  const response = await request.get("/api/export?format=html&download=0&ids=not-a-real-id");
  expect(response.ok()).toBeTruthy();
  const html = await response.text();
  expect(html).toContain("Omitted ids");
  expect(html).not.toContain("<script");
  expect(html).not.toContain(FIXTURE_TITLE);
  expect(html).not.toContain(DRAFT_TITLE);
});
