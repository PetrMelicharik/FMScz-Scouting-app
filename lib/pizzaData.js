// Server-side wrapper around lib/pizzaShared.js — this file touches the
// filesystem (via loadPlayersData) and must never be imported from a "use
// client" component. Client code (e.g. the comparison page) should import
// the pure pieces directly from lib/pizzaShared.js instead.

import { loadPlayersData } from "./playersData";
import { classifyMainSlot } from "./positionSlot";
import { classifyPizzaGroup, computePizzaFromPool, findSimilarPlayers, PIZZA_GROUP_LABELS, buildLeagueMinMinutes, minMinutesFor } from "./pizzaShared";

export * from "./pizzaShared";

// Hranice minut po ligách – spočítá se jednou pro načtená data
let leagueMinCache = null;
let leagueMinCacheFor = null;
function getLeagueMinMinutes(data) {
  if (leagueMinCacheFor !== data) {
    const li = data.columns.indexOf("league_name");
    const mi = data.columns.indexOf("minutes_played");
    leagueMinCache = buildLeagueMinMinutes(data.rows.map((r) => [r[li], r[mi]]));
    leagueMinCacheFor = data;
  }
  return leagueMinCache;
}

export function computePizzaData(player) {
  if (!player || !player.league_name) return null;
  const group = classifyPizzaGroup(player.tm_position || player.position);
  if (!group) return null;

  const data = loadPlayersData();
  const minMinutes = minMinutesFor(getLeagueMinMinutes(data), player.league_name);
  if ((player.minutes_played ?? 0) < minMinutes) {
    return { insufficient: true, group, groupLabel: PIZZA_GROUP_LABELS[group], minutesPlayed: player.minutes_played ?? 0, minMinutes };
  }

  const cols = data.columns;
  const idx = {};
  cols.forEach((c, i) => { idx[c] = i; });

  const pool = data.rows
    .filter((r) => {
      if (r[idx.league_name] !== player.league_name) return false;
      if ((r[idx.minutes_played] ?? 0) < minMinutes) return false;
      const pos = r[idx.tm_position] || r[idx.position];
      return classifyPizzaGroup(pos) === group;
    })
    .map((r) => {
      const o = {};
      cols.forEach((c, i) => { o[c] = r[i]; });
      return o;
    });

  const result = computePizzaFromPool(player, pool, group);
  return result ? { ...result, minMinutes } : null;
}

/* ------------------------------------------------------------------ */
/* Similar players — same position group, any league                   */
/* ------------------------------------------------------------------ */

export function computeSimilarPlayersData(player, topN = 8) {
  if (!player) return null;
  const group = classifyPizzaGroup(player.tm_position || player.position);
  if (!group) return null;

  const data = loadPlayersData();
  const leagueMin = getLeagueMinMinutes(data);
  if ((player.minutes_played ?? 0) < minMinutesFor(leagueMin, player.league_name)) {
    return { insufficient: true, group, groupLabel: PIZZA_GROUP_LABELS[group] };
  }

  const cols = data.columns;

  const pool = data.rows
    .map((r, i) => {
      const o = { _id: i };
      cols.forEach((c, j) => { o[c] = r[j]; });
      return o;
    })
    .filter((r) => {
      // každý kandidát podle hranice minut své vlastní ligy
      if ((r.minutes_played ?? 0) < minMinutesFor(leagueMin, r.league_name)) return false;
      const pos = r.tm_position || r.position;
      return classifyPizzaGroup(pos) === group;
    });

  const results = findSimilarPlayers(player, pool, group, { topN });
  return { group, groupLabel: PIZZA_GROUP_LABELS[group], results };
}

/* ------------------------------------------------------------------ */
/* League-wide rank for one stat (no position/minutes filter)          */
/* ------------------------------------------------------------------ */

export function computeLeagueRank(player, statKey) {
  if (!player || !player.league_name) return null;
  const val = player[statKey];
  if (val === null || val === undefined || val === "") return null;
  const pv = Number(val);
  if (Number.isNaN(pv)) return null;

  const isGK = classifyMainSlot(player.tm_position || player.position) === "GK";

  const data = loadPlayersData();
  const cols = data.columns;
  const idx = {};
  cols.forEach((c, i) => { idx[c] = i; });
  const leagueIdx = idx.league_name;
  const statIdx = idx[statKey];
  const tmPosIdx = idx.tm_position;
  const posIdx = idx.position;

  let total = 0;
  let higher = 0;
  for (const r of data.rows) {
    if (r[leagueIdx] !== player.league_name) continue;
    const rowIsGK = classifyMainSlot(r[tmPosIdx] || r[posIdx]) === "GK";
    if (rowIsGK !== isGK) continue;
    const v = r[statIdx];
    if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) continue;
    total++;
    if (Number(v) > pv) higher++;
  }
  if (total < 2) return null;
  return { rank: higher + 1, total };
}
