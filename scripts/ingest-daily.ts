import { getDb } from "../src/lib/db";
import { runEnabledAdapters } from "../src/lib/ingest";

async function main() {
  const force = process.argv.includes("--force");
  const runs = await runEnabledAdapters(getDb(), { force });
  let failed = 0;
  if (!runs.length) {
    console.log("No enabled adapters.");
    process.exit(0);
  }
  for (const run of runs) {
    console.log(`${run.adapterId}: ${run.outcome}: ${run.message}`);
    if (run.outcome === "error") failed += 1;
  }
  console.log(failed ? `${failed} enabled source(s) failed. Drafts already saved were not published.` : "Enabled sources finished. Nothing was auto-published.");
  process.exit(failed ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
