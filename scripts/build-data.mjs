// Runs automatically before every `next build` (see package.json "prebuild").
// Reads data/db.xlsx from the repo and turns it into public/data/players.json,
// which the app fetches at runtime. Update the database by replacing the .xlsx file
// in the repo and pushing — Vercel will re-run this script on every deploy.
//
// If data/media-map.json exists (produced by scripts/fetch-media.mjs — see its
// header comment), photo/logo URLs are merged in as three extra columns:
// photo_url, club_logo_url, league_logo_url.
//
// If data/tm_data.json exists (produced by the local Transfermarkt scraper —
// see its header comment), it's merged in as four extra columns: tm_position,
// market_value, contract_until, foot.
//
// If data/form-map.json exists (produced by scripts/fetch-media.mjs, phase 4),
// it's merged in as two extra columns: form_ratings (array of the last few
// match ratings, newest first) and form_avg (their average).

import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { playerClubKey } from "../lib/normalize.js";

const SRC = path.join(process.cwd(), "data", "db.xlsx");
const MEDIA_MAP_FILE = path.join(process.cwd(), "data", "media-map.json");
const TM_DATA_FILE = path.join(process.cwd(), "data", "tm_data.json");
const FORM_MAP_FILE = path.join(process.cwd(), "data", "form-map.json");
const OUT_DIR = path.join(process.cwd(), "public", "data");
const OUT_FILE = path.join(OUT_DIR, "players.json");

function fail(msg) {
  console.error(`\n[build-data] ${msg}\n`);
  process.exit(1);
}

if (!fs.existsSync(SRC)) {
  fail(`Nenalezen soubor ${SRC}. Nahraj databázi hráčů jako data/db.xlsx.`);
}

const wb = XLSX.readFile(SRC);
const sheet = wb.Sheets[wb.SheetNames[0]];
const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

if (!aoa.length) fail("Soubor data/db.xlsx je prázdný.");

const rawHeader = aoa[0];
const keepIdx = [];
const columns = [];
rawHeader.forEach((h, i) => {
  const name = h === null || h === undefined ? "" : String(h).trim();
  if (!name || /^unnamed/i.test(name)) return;
  keepIdx.push(i);
  columns.push(name);
});

let rows = aoa
  .slice(1)
  .filter((row) => row.some((v) => v !== null && v !== undefined && v !== ""))
  .map((row) => keepIdx.map((i) => (row[i] === undefined ? null : row[i])));

if (!columns.length || !rows.length) {
  fail("Nepodařilo se rozpoznat sloupce nebo řádky v data/db.xlsx.");
}

// Drop exact-duplicate rows (same player, same season, identical stats across
// every column) — footystats exports have occasionally contained the same
// player-season row twice. Keeps the first occurrence, preserves row order.
const rowCountBeforeDedup = rows.length;
const seenRows = new Set();
rows = rows.filter((row) => {
  const key = JSON.stringify(row);
  if (seenRows.has(key)) return false;
  seenRows.add(key);
  return true;
});
const duplicatesRemoved = rowCountBeforeDedup - rows.length;

let mediaStats = null;
if (fs.existsSync(MEDIA_MAP_FILE)) {
  const media = JSON.parse(fs.readFileSync(MEDIA_MAP_FILE, "utf-8"));
  const nameIdx = columns.indexOf("player_name");
  const clubIdx = columns.indexOf("Current Club");
  const leagueIdx = columns.indexOf("league_name");

  columns.push("photo_url", "club_logo_url", "league_logo_url");
  let photoHits = 0, clubHits = 0, leagueHits = 0;
  rows = rows.map((row) => {
    const club = clubIdx >= 0 ? row[clubIdx] : null;
    const photo = nameIdx >= 0 && club ? media.players?.[playerClubKey(row[nameIdx], club)] : null;
    const clubLogo = club ? media.clubs?.[club] : null;
    const league = leagueIdx >= 0 ? row[leagueIdx] : null;
    const leagueLogo = league ? media.leagues?.[league] : null;
    if (photo) photoHits++;
    if (clubLogo) clubHits++;
    if (leagueLogo) leagueHits++;
    return [...row, photo || null, clubLogo || null, leagueLogo || null];
  });
  mediaStats = { photoHits, clubHits, leagueHits, total: rows.length };
}

let tmStats = null;
if (fs.existsSync(TM_DATA_FILE)) {
  const tm = JSON.parse(fs.readFileSync(TM_DATA_FILE, "utf-8"));
  const nameIdx = columns.indexOf("player_name");
  const clubIdx = columns.indexOf("Current Club");

  columns.push("tm_position", "market_value", "contract_until", "foot");
  let hits = 0;
  rows = rows.map((row) => {
    const club = clubIdx >= 0 ? row[clubIdx] : null;
    const entry = nameIdx >= 0 && club ? tm[playerClubKey(row[nameIdx], club)] : null;
    if (entry && !entry.error) hits++;
    return [
      ...row,
      entry?.position || null,
      entry?.marketValue || null,
      entry?.contractUntil || null,
      entry?.foot || null,
    ];
  });
  tmStats = { hits, total: rows.length };
}

let formStats = null;
if (fs.existsSync(FORM_MAP_FILE)) {
  const form = JSON.parse(fs.readFileSync(FORM_MAP_FILE, "utf-8"));
  const nameIdx = columns.indexOf("player_name");
  const clubIdx = columns.indexOf("Current Club");

  columns.push("form_ratings", "form_dates", "form_last_date", "form_avg");
  let hits = 0;
  rows = rows.map((row) => {
    const club = clubIdx >= 0 ? row[clubIdx] : null;
    const entry = nameIdx >= 0 && club ? form[playerClubKey(row[nameIdx], club)] : null;
    if (entry) hits++;
    return [
      ...row,
      entry?.ratings ? entry.ratings.map((r) => r.rating) : null,
      entry?.ratings ? entry.ratings.map((r) => r.date) : null,
      entry?.ratings?.[0]?.date ?? null,
      entry?.avg ?? null,
    ];
  });
  formStats = { hits, total: rows.length };
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
if (duplicatesRemoved > 0) {
  console.log(`[build-data] Odstraněno ${duplicatesRemoved} přesně duplicitních řádků z data/db.xlsx.`);
}
if (mediaStats) {
  console.log(`[build-data] media-map.json nalezen: fotky ${mediaStats.photoHits}/${mediaStats.total}, loga klubů ${mediaStats.clubHits}/${mediaStats.total}, loga lig ${mediaStats.leagueHits}/${mediaStats.total}`);
} else {
  console.log(`[build-data] data/media-map.json nenalezen — fotky/loga se nezobrazí, dokud nespustíš "npm run fetch-media".`);
}
if (tmStats) {
  console.log(`[build-data] tm_data.json nalezen: Transfermarkt data u ${tmStats.hits}/${tmStats.total} hráčů.`);
} else {
  console.log(`[build-data] data/tm_data.json nenalezen — pozice/tržní hodnota/smlouva/noha se nezobrazí, dokud nespustíš lokální Transfermarkt scraper.`);
}
if (formStats) {
  console.log(`[build-data] form-map.json nalezen: forma u ${formStats.hits}/${formStats.total} hráčů.`);
} else {
  console.log(`[build-data] data/form-map.json nenalezen — forma z posledních zápasů se nezobrazí, dokud nespustíš "npm run fetch-media".`);
}
