// Runs automatically before every `next build` (see package.json "prebuild").
// Reads data/players.xlsx from the repo and turns it into public/data/players.json,
// which the app fetches at runtime. Update the database by replacing the .xlsx file
// in the repo and pushing — Vercel will re-run this script on every deploy.

import XLSX from "xlsx";
import fs from "fs";
import path from "path";

const SRC = path.join(process.cwd(), "data", "players.xlsx");
const OUT_DIR = path.join(process.cwd(), "public", "data");
const OUT_FILE = path.join(OUT_DIR, "players.json");

function fail(msg) {
  console.error(`\n[build-data] ${msg}\n`);
  process.exit(1);
}

if (!fs.existsSync(SRC)) {
  fail(`Nenalezen soubor ${SRC}. Nahraj databázi hráčů jako data/players.xlsx.`);
}

const wb = XLSX.readFile(SRC);
const sheet = wb.Sheets[wb.SheetNames[0]];
const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

if (!aoa.length) fail("Soubor data/players.xlsx je prázdný.");

const rawHeader = aoa[0];
const keepIdx = [];
const columns = [];
rawHeader.forEach((h, i) => {
  const name = h === null || h === undefined ? "" : String(h).trim();
  if (!name || /^unnamed/i.test(name)) return;
  keepIdx.push(i);
  columns.push(name);
});

const rows = aoa
  .slice(1)
  .filter((row) => row.some((v) => v !== null && v !== undefined && v !== ""))
  .map((row) => keepIdx.map((i) => (row[i] === undefined ? null : row[i])));

if (!columns.length || !rows.length) {
  fail("Nepodařilo se rozpoznat sloupce nebo řádky v data/players.xlsx.");
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(
  OUT_FILE,
  JSON.stringify({
    columns,
    rows,
    rowCount: rows.length,
    updatedAt: new Date().toISOString(),
  })
);

console.log(`[build-data] OK: ${rows.length} hráčů, ${columns.length} sloupců -> ${path.relative(process.cwd(), OUT_FILE)}`);
