import { getDb } from "../src/lib/db";
import { runAdapter, runEnabledAdapters } from "../src/lib/ingest";

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  if (args.includes("--all") || args.includes("--daily")) {
    const runs = await runEnabledAdapters(getDb(), { force });
    let failed = 0;
    for (const run of runs) {
      console.log(`${run.adapterId}: ${run.outcome}: ${run.message}`);
      if (run.outcome === "error") failed += 1;
    }
    process.exit(failed ? 1 : 0);
  }
  const adapterId = args.find((arg) => !arg.startsWith("--"));
  if (!adapterId) {
    console.error("Usage: npm run ingest -- <adapter-id> [--force]");
    console.error("       npm run ingest:daily");
    process.exit(1);
  }
  const run = await runAdapter(getDb(), adapterId, { force });
  console.log(`${run.outcome}: ${run.message}`);
  if (run.outcome === "error") process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
