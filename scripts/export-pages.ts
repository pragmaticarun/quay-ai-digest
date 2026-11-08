import fs from "node:fs";
import path from "node:path";
import { getDb } from "../src/lib/db";
import { listEntries } from "../src/lib/entries";
import { writePagesSite } from "../src/lib/pages-export";
import { assertPagesSnapshot, pagesBase, toPagesRecord, type PagesRecord } from "../src/lib/pages-public";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function readSnapshot(file: string): PagesRecord[] {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  return assertPagesSnapshot(parsed);
}

function recordsFromDb(): PagesRecord[] {
  const records: PagesRecord[] = [];
  for (const entry of listEntries(getDb())) {
    const record = toPagesRecord(entry);
    if (record) records.push(record);
  }
  return records;
}

function main() {
  const fromDb = process.argv.includes("--from-db");
  const base = pagesBase(arg("--base") ?? process.env.QUAY_PAGES_BASE);
  if (fromDb) {
    const records = recordsFromDb();
    const destination = path.join(process.cwd(), "data", "pages-candidate.json");
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, `${JSON.stringify({ records }, null, 2)}\n`);
    console.log(`Wrote ${records.length} reviewed record(s) to ${destination}.`);
    console.log("That file is gitignored. It was not copied to site/published.json and it was not deployed.");
    return;
  }
  const snapshotPath = path.resolve(arg("--snapshot") ?? path.join(process.cwd(), "site", "published.json"));
  const outDir = path.resolve(arg("--out") ?? path.join(process.cwd(), "pages-dist"));
  const records = readSnapshot(snapshotPath);
  writePagesSite(outDir, base, records);
  console.log(`Wrote ${records.length} reviewed record(s) to ${outDir} with base ${base || "/"}.`);
}

main();
