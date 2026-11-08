import fs from "node:fs";
import path from "node:path";
import { renderAbout, renderDetail, renderDigest, renderIndex, renderNotFound, renderSources } from "@/lib/pages-html";
import { assertPagesSnapshot, type PagesRecord } from "@/lib/pages-public";

export function exportPagesFromSnapshot(input: { snapshotPath: string; outDir: string; base: string }) {
  const records = assertPagesSnapshot(JSON.parse(fs.readFileSync(input.snapshotPath, "utf8")) as unknown);
  writePagesSite(input.outDir, input.base, records);
  return records;
}

export function writePagesSite(outDir: string, base: string, records: PagesRecord[]) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, "assets"), { recursive: true });
  fs.mkdirSync(path.join(outDir, "digest"), { recursive: true });
  fs.mkdirSync(path.join(outDir, "sources"), { recursive: true });
  fs.mkdirSync(path.join(outDir, "about"), { recursive: true });
  const staticDir = path.join(process.cwd(), "pages-static");
  fs.copyFileSync(path.join(staticDir, "desk.css"), path.join(outDir, "assets", "desk.css"));
  fs.copyFileSync(path.join(staticDir, "desk.js"), path.join(outDir, "assets", "desk.js"));
  fs.writeFileSync(path.join(outDir, "index.html"), renderIndex(base, records));
  fs.writeFileSync(path.join(outDir, "digest", "index.html"), renderDigest(base, records));
  fs.writeFileSync(path.join(outDir, "sources", "index.html"), renderSources(base, records));
  fs.writeFileSync(path.join(outDir, "about", "index.html"), renderAbout(base, records));
  fs.writeFileSync(path.join(outDir, "404.html"), renderNotFound(base));
  fs.writeFileSync(path.join(outDir, ".nojekyll"), "");
  fs.writeFileSync(path.join(outDir, "snapshot.json"), `${JSON.stringify({ records }, null, 2)}\n`);
  for (const record of records) {
    const dir = path.join(outDir, "items", record.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), renderDetail(base, record, records));
  }
}
