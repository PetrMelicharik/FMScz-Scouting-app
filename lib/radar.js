// Radar příležitostí – výpočet (bez zobrazení, to je v components/RadarView.jsx).
//
// Hledá hráče, kterým brzy končí smlouva, mají nízkou tržní hodnotu a přitom
// hrají dobře. "Skóre" = průměrný percentil ze statistik pizza grafu, tedy
// srovnání s hráči stejné skupiny pozic ve stejné lize (se stejnou hranicí
// minut jako pizza graf). Filtry (smlouva, hodnota, věk, liga) omezují jen to,
// KOHO ukážeme – srovnávací skupina zůstává vždy celá liga.

import { STAT_LABELS, LOWER_IS_BETTER_STATS } from "./statMeta";
import {
  classifyPizzaGroup, computePizzaFromPool, parseMarketValue,
  buildLeagueMinMinutes, minMinutesFor, OUTFIELD_STATS, GK_STATS,
} from "./pizzaShared";

// FootyStats u statistik, které v dané lize nesleduje, zapíše 0. Když má v lize
// aspoň 90 % hráčů (s dost minutami) u statistiky nulu, bereme ji jako
// nesledovanou – jinak by hráč s nulou dostal percentil 100 (všichni mají 0).
const UNTRACKED_ZERO_SHARE = 0.9;
// Hráč se v radaru ukáže, jen když má aspoň tolik statistik se skutečnými daty
// (u hráčů v poli z 23, u brankářů z 9 – tam je hranice úměrně nižší).
const MIN_TRACKED_STATS_OUTFIELD = 12;
const MIN_TRACKED_STATS_GK = 5;

function isEmpty(v) {
  return v === null || v === undefined || v === "" || Number.isNaN(Number(v));
}

// Statistiky, které liga nesleduje (≥ 90 % nul). players = hráči ligy s dost minutami.
function untrackedStats(players, statKeys) {
  const out = new Set();
  for (const key of statKeys) {
    const vals = players.map((r) => r[key]).filter((v) => !isEmpty(v)).map(Number);
    if (vals.length && vals.filter((v) => v === 0).length / vals.length >= UNTRACKED_ZERO_SHARE) out.add(key);
  }
  return out;
}

// Pořadí záložek (skupiny pozic stejné jako u pizza grafů)
export const RADAR_GROUPS = ["CB", "FB", "CM", "CAM", "WING", "FW", "GK"];

// Konec smlouvy "30/06/2027" (DD/MM/YYYY) → "2027-06-30", aby šel porovnat jako text.
export function parseContractDate(raw) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(raw ?? "").trim());
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

// "30/06/2027" → "30. 6. 2027" (pro zobrazení)
export function formatContractDate(raw) {
  const iso = parseContractDate(raw);
  if (!iso) return raw || "–";
  const [y, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
}

// Nabídka "Smlouva do": nejbližší čtyři konce přestupních období (30. 6. / 31. 12.)
// od dneška. Výchozí volba = 30. 6. příštího roku.
export function contractDeadlineOptions() {
  const today = new Date().toISOString().slice(0, 10);
  const out = [];
  for (let y = new Date().getFullYear(); out.length < 4; y++) {
    for (const [md, label] of [["06-30", "30. 6."], ["12-31", "31. 12."]]) {
      const iso = `${y}-${md}`;
      if (iso >= today && out.length < 4) out.push([iso, `Do ${label} ${y}`]);
    }
  }
  return out;
}

export function defaultContractDeadline() {
  return `${new Date().getFullYear() + 1}-06-30`;
}

// Hlavní výpočet. rows = hráči jako objekty (sloupec → hodnota).
// Vrací { [skupina]: [{ player, score, strengths, statsCount }] } seřazené od nejlepšího.
export function computeRadar(rows, { contractBy, maxValue, league, ageMin, ageMax, topN = 10 }) {
  const leagueMin = buildLeagueMinMinutes(rows.map((r) => [r.league_name, r.minutes_played]));

  // 1) Srovnávací skupiny: liga + skupina pozic, jen hráči s dost minutami
  const pools = new Map();
  const groupOf = new Map();
  for (const r of rows) {
    if (!r.league_name) continue;
    const g = classifyPizzaGroup(r.tm_position || r.position);
    if (!g) continue;
    if ((r.minutes_played ?? 0) < minMinutesFor(leagueMin, r.league_name)) continue;
    groupOf.set(r, g);
    const key = `${r.league_name}|${g}`;
    if (!pools.has(key)) pools.set(key, []);
    pools.get(key).push(r);
  }

  // Nesledované statistiky pro každou ligu – zvlášť pro hráče v poli a brankáře
  const leaguePlayers = new Map();
  for (const [r, g] of groupOf) {
    const key = `${r.league_name}|${g === "GK" ? "GK" : "OUT"}`;
    if (!leaguePlayers.has(key)) leaguePlayers.set(key, []);
    leaguePlayers.get(key).push(r);
  }
  const untracked = new Map();
  for (const [key, players] of leaguePlayers) {
    const statKeys = (key.endsWith("|GK") ? GK_STATS : OUTFIELD_STATS).map(([k]) => k);
    untracked.set(key, untrackedStats(players, statKeys));
  }

  // 2) Kandidáti: projdou filtry (smlouva, hodnota, liga, věk)
  const result = Object.fromEntries(RADAR_GROUPS.map((g) => [g, []]));
  for (const [r, g] of groupOf) {
    const end = parseContractDate(r.contract_until);
    if (!end || end > contractBy) continue; // bez známé smlouvy hráč vypadne
    if (maxValue !== null) {
      const v = parseMarketValue(r.market_value);
      if (v === null || v > maxValue) continue; // bez známé hodnoty hráč vypadne
    }
    if (league && r.league_name !== league) continue;
    if (ageMin !== null && (r.age ?? -Infinity) < ageMin) continue;
    if (ageMax !== null && (r.age ?? Infinity) > ageMax) continue;

    // 3) Skóre = průměrný percentil ze statistik pizza grafu
    const pizza = computePizzaFromPool(r, pools.get(`${r.league_name}|${g}`), g);
    if (!pizza) continue;
    // Nesledované statistiky ligy se do skóre nepočítají; málo dat = hráč vypadne
    const skip = untracked.get(`${r.league_name}|${g === "GK" ? "GK" : "OUT"}`) || new Set();
    const stats = pizza.stats.filter((x) => !skip.has(x.key));
    if (stats.length < (g === "GK" ? MIN_TRACKED_STATS_GK : MIN_TRACKED_STATS_OUTFIELD)) continue;
    const score = Math.round(stats.reduce((s, x) => s + x.percentile, 0) / stats.length);

    // Silné stránky = 3 statistiky s nejvyšším percentilem. Statistiky typu
    // "čím méně, tím lépe" (karty, ztráty míče…) se sem nedávají, aby se
    // nečetly jako "hodně karet" – do skóre se ale počítají.
    const strengths = stats
      .filter((x) => !LOWER_IS_BETTER_STATS.has(x.key))
      .sort((a, b) => b.percentile - a.percentile)
      .slice(0, 3)
      .map((x) => ({ key: x.key, label: STAT_LABELS[x.key] || x.key, percentile: x.percentile }));

    result[g].push({ player: r, score, strengths, statsCount: stats.length });
  }

  for (const g of RADAR_GROUPS) {
    result[g].sort((a, b) => b.score - a.score || (b.player.minutes_played ?? 0) - (a.player.minutes_played ?? 0));
    result[g] = { total: result[g].length, items: result[g].slice(0, topN) };
  }
  return result;
}
