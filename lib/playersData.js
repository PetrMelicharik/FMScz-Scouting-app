import fs from "fs";
import path from "path";

let cache = null;
let slugIndex = null;

export function loadPlayersData() {
  if (cache) return cache;
  const file = path.join(process.cwd(), "public", "data", "players.json");
  const raw = fs.readFileSync(file, "utf-8");
  cache = JSON.parse(raw);
  return cache;
}

function rowToPlayer(data, idx) {
  const p = { _id: idx };
  data.columns.forEach((c, i) => { p[c] = data.rows[idx][i]; });
  return p;
}

export function loadPlayerById(id) {
  const data = loadPlayersData();
  const idx = Number(id);
  if (!Number.isInteger(idx) || idx < 0 || idx >= data.rows.length) return null;
  return rowToPlayer(data, idx);
}

// Resolves a profile URL segment to a player.
//   "rajmund-mikus-1996-05-14"           -> that player's main row
//   "rajmund-mikus-1996-05-14--<league>" -> his row in that league; if that row
//                                           no longer exists, his main row
//   "123" (old-style link)               -> row 123
// Returns { player, canonical } — canonical is the slug the page should be
// served under (the page redirects there when it differs from the URL).
export function loadPlayerBySlug(segment) {
  const data = loadPlayersData();
  const slug = decodeURIComponent(String(segment || ""));
  const slugCol = data.columns.indexOf("profile_slug");

  if (/^\d+$/.test(slug)) {
    const player = loadPlayerById(slug);
    if (!player) return null;
    return { player, canonical: player.profile_slug || String(player._id) };
  }
  if (slugCol < 0) return null;

  if (!slugIndex) {
    slugIndex = new Map();
    data.rows.forEach((r, i) => slugIndex.set(r[slugCol], i));
  }
  let idx = slugIndex.get(slug);
  if (idx === undefined && slug.includes("--")) idx = slugIndex.get(slug.split("--")[0]);
  if (idx === undefined) return null;
  const player = rowToPlayer(data, idx);
  return { player, canonical: player.profile_slug };
}
