// Server-side wrapper around lib/pizzaShared.js — this file touches the
// filesystem (via loadPlayersData) and must never be imported from a "use
// client" component. Client code (e.g. the comparison page) should import
// the pure pieces directly from lib/pizzaShared.js instead.

import { loadPlayersData } from "./playersData";
import { classifyMainSlot } from "./positionSlot";
import { classifyPizzaGroup, computePizzaFromPool, PIZZA_GROUP_LABELS, MIN_MINUTES } from "./pizzaShared";

export * from "./pizzaShared";

export function computePizzaData(player) {
  if (!player || !player.league_name) return null;
  const group = classifyPizzaGroup(player.tm_position || player.position);
  if (!group) return null;
  if ((player.minutes_played ?? 0) < MIN_MINUTES) {
    return { insufficient: true, group, groupLabel: PIZZA_GROUP_LABELS[group], minutesPlayed: player.minutes_played ?? 0 };
  }

  const data = loadPlayersData();
  const cols = data.columns;
  const idx = {};
  cols.forEach((c, i) => { idx[c] = i; });

  const pool = data.rows
    .filter((r) => {
      if (r[idx.league_name] !== player.league_name) return false;
      if ((r[idx.minutes_played] ?? 0) < MIN_MINUTES) return false;
      const pos = r[idx.tm_position] || r[idx.position];
      return classifyPizzaGroup(pos) === group;
    })
    .map((r) => {
      const o = {};
      cols.forEach((c, i) => { o[c] = r[i]; });
      return o;
    });

  return computePizzaFromPool(player, pool, group);
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
