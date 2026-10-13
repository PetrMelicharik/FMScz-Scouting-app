// Shortlist ↔ database matching.
//
// Shortlist rows in Supabase used to point at players only via player_id —
// the row index in players.json. That index shifts every time db.xlsx gets
// new players (rows are sorted by league + name), so after an update the
// shortlist pointed at different people. Now each entry stores player_key
// (name + date of birth, see lib/normalize.js), which survives updates.
//
// Older entries without player_key are matched by the name + club stored
// with them when they were added (that data was always saved correctly),
// and get their player_key filled in on the next visit of the Shortlist page.
import { playerKey, normalizePlayerName, normalizeClubName, normalizeLeagueName } from "./normalize";

export function rowKey(row) {
  return row.player_key || playerKey(row.player_name, row.birthday);
}

function seasonStart(season) {
  const m = String(season ?? "").match(/\d{4}/);
  return m ? Number(m[0]) : 0;
}

// Several rows can belong to one person (two leagues, two seasons). Prefer
// the league the player was shortlisted in, then the newest season, then
// the row with the most minutes.
function pickBestRow(cands, entry) {
  const wantLeague = normalizeLeagueName(entry?.league || "");
  return [...cands].sort((a, b) => {
    const la = wantLeague && normalizeLeagueName(a.league_name) === wantLeague ? 1 : 0;
    const lb = wantLeague && normalizeLeagueName(b.league_name) === wantLeague ? 1 : 0;
    if (la !== lb) return lb - la;
    const sa = seasonStart(a.season), sb = seasonStart(b.season);
    if (sa !== sb) return sb - sa;
    return (Number(b.minutes_played) || 0) - (Number(a.minutes_played) || 0);
  })[0];
}

// rows: player objects with _id (players.json). Build once per dataset.
export function buildPlayerIndex(rows) {
  const byKey = new Map(), byNameClub = new Map(), byName = new Map();
  const push = (m, k, r) => { if (!m.has(k)) m.set(k, []); m.get(k).push(r); };
  for (const r of rows) {
    const n = normalizePlayerName(r.player_name);
    push(byKey, rowKey(r), r);
    push(byNameClub, `${n}|${normalizeClubName(r["Current Club"])}`, r);
    push(byName, n, r);
  }
  return { byKey, byNameClub, byName };
}

// Returns { key, row } for a shortlist entry, or { key: null, row: null }
// when the player is no longer in the database.
export function resolveEntry(entry, index) {
  if (entry.player_key) {
    const cands = index.byKey.get(entry.player_key);
    return { key: entry.player_key, row: cands ? pickBestRow(cands, entry) : null };
  }
  const n = normalizePlayerName(entry.player_name);
  let cands = index.byNameClub.get(`${n}|${normalizeClubName(entry.club)}`);
  if (!cands || !cands.length) {
    // Player changed club since being shortlisted: accept a name-only match
    // only if it's unambiguous (all candidates are the same person).
    const byName = index.byName.get(n) || [];
    const keys = new Set(byName.map(rowKey));
    cands = keys.size === 1 ? byName : null;
  }
  if (!cands || !cands.length) return { key: null, row: null };
  // Rare: two different people with the same name at the same club. Narrow
  // down by the position stored with the entry.
  if (new Set(cands.map(rowKey)).size > 1 && entry.position) {
    const pos = String(entry.position).toLowerCase();
    const byPos = cands.filter((r) => String(r.tm_position || r.position || "").toLowerCase() === pos);
    if (byPos.length) cands = byPos;
  }
  const row = pickBestRow(cands, entry);
  return { key: rowKey(row), row };
}

// Set of player keys on the shortlist, for "is this row shortlisted?" checks.
export function shortlistKeySet(entries, index) {
  const set = new Set();
  for (const e of entries || []) {
    const { key } = resolveEntry(e, index);
    if (key) set.add(key);
  }
  return set;
}

// Used on the player profile, where the full dataset isn't loaded: does a
// shortlist entry refer to this player?
export function entryMatchesPlayer(entry, player) {
  if (entry.player_key) return entry.player_key === rowKey(player);
  return (
    normalizePlayerName(entry.player_name) === normalizePlayerName(player.player_name) &&
    normalizeClubName(entry.club) === normalizeClubName(player["Current Club"])
  );
}

