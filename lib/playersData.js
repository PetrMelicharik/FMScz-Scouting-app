import fs from "fs";
import path from "path";

let cache = null;

export function loadPlayersData() {
  if (cache) return cache;
  const file = path.join(process.cwd(), "public", "data", "players.json");
  const raw = fs.readFileSync(file, "utf-8");
  cache = JSON.parse(raw);
  return cache;
}

export function loadPlayerById(id) {
  const data = loadPlayersData();
  const idx = Number(id);
  if (!Number.isInteger(idx) || idx < 0 || idx >= data.rows.length) return null;
  const cols = data.columns;
  const row = data.rows[idx];
  const p = { _id: idx };
  cols.forEach((c, i) => { p[c] = row[i]; });
  return p;
}
