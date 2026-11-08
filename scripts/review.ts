import { getDb } from "../src/lib/db";
import { getEntry, listEntries, listEvents, saveEditorial, transitionEntry } from "../src/lib/entries";

const [command, id, ...rest] = process.argv.slice(2);
const db = getDb();
const now = new Date().toISOString();

function flag(name: string): string | undefined {
  const index = rest.indexOf(name);
  if (index === -1) return undefined;
  return rest[index + 1];
}

if (command === "list" || !command) {
  for (const entry of listEntries(db)) {
    console.log(`${entry.status}\t${entry.type}\t${entry.origin}\t${entry.id}\t${entry.title}`);
  }
  process.exit(0);
}

if (!id) {
  console.error("Usage: npm run review -- list | show <id> | save <id> --fact \"...\" | publish <id> --note \"...\" --confirm | reject <id> --note \"...\"");
  process.exit(1);
}

if (command === "show") {
  const entry = getEntry(db, id);
  if (!entry) {
    console.error("No record with that id.");
    process.exit(1);
  }
  console.log(JSON.stringify({ entry, events: listEvents(db, id) }, null, 2));
  process.exit(0);
}

if (command === "save") {
  const entry = saveEditorial(db, id, { factSummary: flag("--fact"), interpretation: flag("--interpretation"), caveats: flag("--caveats"), engineeringRelevance: flag("--relevance"), reviewNote: flag("--note") }, now);
  console.log(`Saved ${entry.id} (${entry.factSummaryKind}).`);
  process.exit(0);
}

if (command === "publish" || command === "reject" || command === "start_review" || command === "return_to_draft") {
  const entry = transitionEntry(db, id, command, {
    note: flag("--note") ?? "",
    confirmReviewed: rest.includes("--confirm"),
    now,
  });
  console.log(`${entry.status} ${entry.id}`);
  process.exit(0);
}

console.error(`Unknown command ${command}`);
process.exit(1);
