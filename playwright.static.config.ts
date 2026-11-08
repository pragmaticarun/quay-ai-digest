import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "static.spec.ts",
  use: { baseURL: "http://127.0.0.1:43131" },
  webServer: {
    command:
      "npx tsx scripts/export-pages.ts --snapshot e2e/pages-fixture.json --out e2e/pages-dist --base \"\" && python3 -m http.server 43131 --bind 127.0.0.1 --directory e2e/pages-dist",
    url: "http://127.0.0.1:43131/",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
