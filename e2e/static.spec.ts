import { expect, test } from "@playwright/test";

test("static reading site filters, saves, and previews a reviewed fixture", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "STATIC FIXTURE reviewed record" })).toBeVisible();
  await page.getByLabel("Search").fill("no-such-static-query");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Showing 0 published records matching these filters.")).toBeVisible();
  await page.getByLabel("Search").fill("STATIC FIXTURE");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Showing 1 published record matching these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Save on this browser" }).click();
  await expect(page.getByRole("button", { name: "Saved on this browser" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Saved on this browser" })).toBeVisible();
  await page.goto("/digest/");
  await page.getByRole("checkbox", { name: /STATIC FIXTURE/ }).check();
  await page.getByRole("button", { name: "Preview selection" }).click();
  await expect(page.locator("#digest-preview")).toContainText("https://example.com/papers/static-fixture");
  await expect(page.locator("#digest-preview")).not.toContainText("sourceExcerpt");
});
