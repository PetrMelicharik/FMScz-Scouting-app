import { STAT_LABELS, formatStat } from "./statMeta";

export const MIN_MINUTES = 300;
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

export const OUTFIELD_STATS = [
  ["goals_per_90", "attack"], ["xg_per_90", "attack"], ["assists_per_90", "attack"],
  ["xa_per_90", "attack"], ["shots_per_90", "attack"], ["shots_on_target_per_90", "attack"],
  ["passes_per_90", "passing"], ["passes_completed_per_90", "passing"], ["key_passes_per_90", "passing"],
  ["crosses_per_90", "passing"], ["accurate_crosses_per_90", "passing"],
  ["dribbles_per_90", "dribble"], ["dribbles_successful_per_90", "dribble"],
  ["tackles_per_90", "defense"], ["interceptions_per_90", "defense"], ["blocks_per_90", "defense"],
  ["clearances_per_90", "defense"], ["aerial_duels_won_per_90", "defense"], ["duels_won_per_90", "defense"],
  ["dribbled_past_per_90", "defense"],
];

export const GK_STATS = [
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

// Pure — takes an already-filtered comparison pool as an array of row
// OBJECTS (same shape as `player`: key → value), so it works equally from
// server code (see lib/pizzaData.js) or from a client component that
// fetched /data/players.json itself (e.g. the player-comparison page).
export function computePizzaFromPool(player, pool, group) {
  const statList = group === "GK" ? GK_STATS : OUTFIELD_STATS;

  const stats = statList
    .map(([key, category]) => {
      const playerVal = player[key];
      if (playerVal === null || playerVal === undefined || playerVal === "") return null;
      const pv = Number(playerVal);
      if (Number.isNaN(pv)) return null;

      const poolVals = pool
        .map((r) => r[key])
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
  return { group, groupLabel: PIZZA_GROUP_LABELS[group], poolSize: pool.length, stats };
}

/* ------------------------------------------------------------------ */
/* Similar players — nearest neighbours by percentile profile          */
/* ------------------------------------------------------------------ */

// Pure — pool is an array of row OBJECTS (already filtered to the same
// position group + minutes threshold by the caller; may span several
// leagues, unlike the single-league pool used by computePizzaFromPool).
// Each candidate is compared to `player` on the same stat list used for
// the pizza chart, by converting every value to its percentile WITHIN the
// pool first (so stats on very different scales, e.g. goals vs passes,
// contribute equally), then ranking candidates by RMSE distance between
// percentile vectors. Requires at least 4 shared stat dimensions.
export function findSimilarPlayers(player, pool, group, { topN = 8 } = {}) {
  const statList = group === "GK" ? GK_STATS : OUTFIELD_STATS;

  const poolValsByStat = {};
  statList.forEach(([key]) => {
    poolValsByStat[key] = pool
      .map((r) => r[key])
      .filter((v) => v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v)))
      .map(Number)
      .sort((a, b) => a - b);
  });

  function percentileOf(key, val) {
    const arr = poolValsByStat[key];
    if (!arr || arr.length < MIN_POOL_SAMPLE) return null;
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] <= val) lo = mid + 1; else hi = mid;
    }
    return Math.round((lo / arr.length) * 100);
  }

  const targetVec = {};
  statList.forEach(([key]) => {
    const v = player[key];
    if (v === null || v === undefined || v === "") return;
    const pv = Number(v);
    if (Number.isNaN(pv)) return;
    const pct = percentileOf(key, pv);
    if (pct !== null) targetVec[key] = pct;
  });

  const dims = Object.keys(targetVec);
  if (dims.length < 4) return [];

  const candidates = pool
    .filter((r) => r._id !== player._id)
    .map((r) => {
      let sumSq = 0;
      let n = 0;
      dims.forEach((key) => {
        const v = r[key];
        if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return;
        const pct = percentileOf(key, Number(v));
        if (pct === null) return;
        const diff = pct - targetVec[key];
        sumSq += diff * diff;
        n++;
      });
      if (n < 4) return null;
      const rmse = Math.sqrt(sumSq / n);
      const similarity = Math.max(0, Math.round(100 - rmse));
      return { player: r, similarity, matchedStats: n };
    })
    .filter(Boolean)
    .sort((a, b) => b.similarity - a.similarity || b.matchedStats - a.matchedStats);

  return candidates.slice(0, topN);
}

/* ------------------------------------------------------------------ */
/* Scouting tool — rank a pool of players by a chosen set of stats      */
/* ------------------------------------------------------------------ */

// Parses a Transfermarkt-style market value string ("€1.20m", "€450k") into
// a plain number of euros. Returns null when it can't be parsed.
export function parseMarketValue(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const m = /([\d.,]+)\s*([km]?)/i.exec(String(raw).replace(/[€$£]/g, "").trim());
  if (!m) return null;
  const num = Number(m[1].replace(",", "."));
  if (Number.isNaN(num)) return null;
  const suffix = m[2].toLowerCase();
  if (suffix === "m") return num * 1_000_000;
  if (suffix === "k") return num * 1_000;
  return num;
}

// Pure — pool is an array of row OBJECTS already filtered by the caller
// (position group, minutes, age, league, market value, …). Ranks every
// candidate by the AVERAGE percentile (within the pool) across the chosen
// statKeys — the same "convert everything to a percentile first" trick
// used by findSimilarPlayers, so a scout can mix stats on very different
// scales (e.g. tackles/90 and pass completion %) into one score. A
// candidate needs at least half of the chosen stats (min 1) to qualify,
// so a couple of missing data points don't disqualify them outright.
export function rankPlayersByStats(pool, statKeys, { topN = 20 } = {}) {
  if (!statKeys || statKeys.length === 0) return [];
  const minMatched = Math.max(1, Math.ceil(statKeys.length / 2));

  const poolValsByStat = {};
  statKeys.forEach((key) => {
    poolValsByStat[key] = pool
      .map((r) => r[key])
      .filter((v) => v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v)))
      .map(Number)
      .sort((a, b) => a - b);
  });

  function percentileOf(key, val) {
    const arr = poolValsByStat[key];
    if (!arr || arr.length < MIN_POOL_SAMPLE) return null;
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] <= val) lo = mid + 1; else hi = mid;
    }
    return Math.round((lo / arr.length) * 100);
  }

  const ranked = pool
    .map((r) => {
      const perStat = {};
      let sum = 0;
      let matched = 0;
      statKeys.forEach((key) => {
        const v = r[key];
        if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) {
          perStat[key] = null;
          return;
        }
        const pct = percentileOf(key, Number(v));
        perStat[key] = pct === null ? null : { value: Number(v), percentile: pct };
        if (pct !== null) {
          sum += pct;
          matched++;
        }
      });
      if (matched < minMatched) return null;
      return { player: r, perStat, matched, score: Math.round(sum / matched) };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.matched - a.matched);

  return ranked.slice(0, topN);
}
