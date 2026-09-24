import { loadPlayersData } from "./playersData";
import { STAT_LABELS, formatStat } from "./statMeta";
import { classifyMainSlot } from "./positionSlot";

const MIN_MINUTES = 300;
const MIN_POOL_SAMPLE = 5; // don't show a slice if fewer than this many comparable players have the stat

/* ------------------------------------------------------------------ */
/* Position → comparison-group classification                          */
/* ------------------------------------------------------------------ */
// Distinct from the Tým týdne formation classifier — here left/right
// midfielders are grouped with full-backs (per how the person defined
// the comparison groups), not with wingers.

function classifyRaw(pos) {
  if (!pos) return null;
  const p = pos.toLowerCase();
  if (p.includes("goalkeeper")) return "GK";
  if (p.includes("right back") || p.includes("right-back") || p.includes("right wing back") || p.includes("right wing-back")) return "RB";
  if (p.includes("left back") || p.includes("left-back") || p.includes("left wing back") || p.includes("left wing-back")) return "LB";
  if (p.includes("centre back") || p.includes("center back") || p.includes("centre-back") || p.includes("center-back")) return "CB";
  if (p.includes("attacking midfield")) return "CAM";
  if (p.includes("defensive midfield") || p.includes("central midfield") || p.includes("centre midfield") || p.includes("center midfield")) return "CM";
  if (p.includes("left midfield")) return "LM";
  if (p.includes("right midfield")) return "RM";
  if (p.includes("left wing")) return "LW";
  if (p.includes("right wing")) return "RW";
  if (p.includes("second striker") || p.includes("centre forward") || p.includes("center forward") || p.includes("forward") || p.includes("striker") || p.includes("attack")) return "FW";
  if (p.includes("defender")) return "GENERIC_DF";
  if (p.includes("midfielder")) return "GENERIC_MF";
  return null;
}

export function classifyPizzaGroup(pos) {
  const raw = classifyRaw(pos);
  switch (raw) {
    case "GK": return "GK";
    case "CB": return "CB";
    case "RB": case "LB": case "RM": case "LM": return "FB";
    case "CM": return "CM";
    case "CAM": return "CAM";
    case "RW": case "LW": return "WING";
    case "FW": return "FW";
    case "GENERIC_DF": return "CB";
    case "GENERIC_MF": return "CM";
    default: return null;
  }
}

export const PIZZA_GROUP_LABELS = {
  GK: "brankáři",
  CB: "střední obránci",
  FB: "krajní obránci a záložníci",
  CM: "střední záložníci",
  CAM: "ofenzivní záložníci",
  WING: "křídla",
  FW: "útočníci",
};

/* ------------------------------------------------------------------ */
/* Stat catalog per chart type, with a colour category                 */
/* ------------------------------------------------------------------ */

export const CATEGORY_COLORS = {
  attack: "#DC2626",
  passing: "#2563EB",
  dribble: "#D97706",
  defense: "#4CB848",
  goalkeeping: "#4CB848",
};

export const CATEGORY_LABELS = {
  attack: "Útočné",
  passing: "Přihrávky",
  dribble: "Driblink",
  defense: "Obranné",
  goalkeeping: "Brankářské",
};

const OUTFIELD_STATS = [
  ["goals_per_90", "attack"], ["xg_per_90", "attack"], ["assists_per_90", "attack"],
  ["xa_per_90", "attack"], ["shots_per_90", "attack"], ["shots_on_target_per_90", "attack"],
  ["passes_per_90", "passing"], ["passes_completed_per_90", "passing"], ["key_passes_per_90", "passing"],
  ["crosses_per_90", "passing"], ["accurate_crosses_per_90", "passing"],
  ["dribbles_per_90", "dribble"], ["dribbles_successful_per_90", "dribble"],
  ["tackles_per_90", "defense"], ["interceptions_per_90", "defense"], ["blocks_per_90", "defense"],
  ["clearances_per_90", "defense"], ["aerial_duels_won_per_90", "defense"], ["duels_won_per_90", "defense"],
  ["dribbled_past_per_90", "defense"],
];

const GK_STATS = [
  ["clean_sheets", "goalkeeping"],
  ["conceded_per_90", "goalkeeping"],
  ["saves_per_90", "goalkeeping"],
  ["shots_faced_per_90", "goalkeeping"],
  ["save_percentage", "goalkeeping"],
  ["punches_per_90", "goalkeeping"],
  ["pens_saved", "goalkeeping"],
  ["passes_per_90", "goalkeeping"],
  ["passes_completed_per_90", "goalkeeping"],
];

/* ------------------------------------------------------------------ */
/* Percentile computation                                               */
/* ------------------------------------------------------------------ */

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

  const pool = data.rows.filter((r) => {
    if (r[idx.league_name] !== player.league_name) return false;
    if ((r[idx.minutes_played] ?? 0) < MIN_MINUTES) return false;
    const pos = r[idx.tm_position] || r[idx.position];
    return classifyPizzaGroup(pos) === group;
  });

  const statList = group === "GK" ? GK_STATS : OUTFIELD_STATS;

  const stats = statList
    .map(([key, category]) => {
      const playerVal = player[key];
      if (playerVal === null || playerVal === undefined || playerVal === "") return null;
      const pv = Number(playerVal);
      if (Number.isNaN(pv)) return null;

      const poolVals = pool
        .map((r) => r[idx[key]])
        .filter((v) => v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v)))
        .map(Number);
      if (poolVals.length < MIN_POOL_SAMPLE) return null;

      const countBelowOrEqual = poolVals.filter((v) => v <= pv).length;
      const percentile = Math.round((countBelowOrEqual / poolVals.length) * 100);

      return {
        key,
        category,
        label: STAT_LABELS[key] || key,
        value: pv,
        display: formatStat(key, pv),
        percentile,
        sampleSize: poolVals.length,
      };
    })
    .filter(Boolean);

  if (stats.length < 4) return null;

  return {
    group,
    groupLabel: PIZZA_GROUP_LABELS[group],
    poolSize: pool.length,
    stats,
  };
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
