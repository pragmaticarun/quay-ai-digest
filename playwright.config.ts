import { defineConfig } from "@playwright/test";

const isolatedPort = 43128;
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseURL ?? `http://127.0.0.1:${isolatedPort}`;

export default defineConfig({
  testDir: "e2e",
  testIgnore: "static.spec.ts",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "off",
  },
  webServer: externalBaseURL
    ? undefined
    : {
        command: `npx tsx e2e/global-setup.ts && NEXT_TELEMETRY_DISABLED=1 QUAY_DB_PATH="$(cat e2e/.isolated-db-path)" npx next dev --hostname 127.0.0.1 --port ${isolatedPort}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
