"use client";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

/* ---------------------------------------------------------------------- */
/* Constants                                                               */
/* ---------------------------------------------------------------------- */

const PAGE_SIZE = 50;
const COLORS = ["#059669", "#2563EB", "#D97706", "#DC2626"];

const STAT_GROUPS = {
  "Útočné": [
    "goals", "goals_per_90", "min_per_goal", "xg", "xg_per_90", "npxg", "npxg_per_90",
    "assists", "assists_per_90", "min_per_assist", "xa", "xa_per_90",
    "goals_involved_per_90", "shots", "shots_per_90", "shots_on_target",
    "shots_on_target_per_90", "shot_accuraccy_percentage",
  ],
  "Přihrávky": [
    "passes", "passes_per_90", "passes_completed", "passes_completed_per_90",
    "pass_completion_rate", "key_passes", "key_passes_per_90", "crosses",
    "crosses_per_90", "accurate_crosses", "accurate_crosses_per_90",
    "cross_completion_rate",
  ],
  "Driblink": [
    "dribbles", "dribbles_per_90", "dribbles_successful", "dribbles_successful_per_90",
    "dribbled_past", "dribbled_past_per_90",
  ],
  "Obranné": [
    "tackles", "tackles_per_90", "interceptions", "interceptions_per_90",
    "blocks", "blocks_per_90", "clearances", "clearances_per_90",
    "aerial_duels_won", "aerial_duels_won_per_90", "duels", "duels_per_90",
    "duels_won", "duels_won_per_90",
  ],
  "Brankářské": [
    "clean_sheets", "conceded_goals", "conceded_per_90", "saves", "saves_per_90",
    "shots_faced", "shots_faced_per_90", "save_percentage", "punches",
    "punches_per_90", "pens_saved",
  ],
  "Obecné": [
    "appearances", "minutes_played", "avg_rating_",
    "rank_in_league_top_attackers", "rank_in_league_top_midfielders",
    "rank_in_league_top_defenders",
  ],
};

const STAT_LABELS = {
  goals: "Góly", goals_per_90: "Góly/90", min_per_goal: "Minut na gól",
  xg: "xG", xg_per_90: "xG/90", npxg: "npxG", npxg_per_90: "npxG/90",
  assists: "Asistence", assists_per_90: "Asistence/90", min_per_assist: "Minut na asistenci",
  xa: "xA", xa_per_90: "xA/90", goals_involved_per_90: "G+A/90",
  shots: "Střely", shots_per_90: "Střely/90", shots_on_target: "Střely na branku",
  shots_on_target_per_90: "Střely na branku/90", shot_accuraccy_percentage: "Přesnost střel",
  passes: "Přihrávky", passes_per_90: "Přihrávky/90", passes_completed: "Přesné přihrávky",
  passes_completed_per_90: "Přesné přihrávky/90", pass_completion_rate: "Úspěšnost přihrávek",
  key_passes: "Klíčové přihrávky", key_passes_per_90: "Klíčové přihrávky/90",
  crosses: "Centry", crosses_per_90: "Centry/90", accurate_crosses: "Přesné centry",
  accurate_crosses_per_90: "Přesné centry/90", cross_completion_rate: "Úspěšnost centrů",
  dribbles: "Driblinky", dribbles_per_90: "Driblinky/90",
  dribbles_successful: "Úspěšné driblinky", dribbles_successful_per_90: "Úspěšné driblinky/90",
  dribbled_past: "Obdriblován", dribbled_past_per_90: "Obdriblován/90",
  tackles: "Zákroky", tackles_per_90: "Zákroky/90", interceptions: "Zisky míče",
  interceptions_per_90: "Zisky míče/90", blocks: "Bloky", blocks_per_90: "Bloky/90",
  clearances: "Odkopy", clearances_per_90: "Odkopy/90",
  aerial_duels_won: "Vzdušné souboje vyhrané", aerial_duels_won_per_90: "Vzdušné souboje vyhrané/90",
  duels: "Souboje", duels_per_90: "Souboje/90", duels_won: "Vyhrané souboje",
  duels_won_per_90: "Vyhrané souboje/90",
  clean_sheets: "Čistá konta", conceded_goals: "Obdržené góly",
  conceded_per_90: "Obdržené góly/90", saves: "Zákroky brankáře",
  saves_per_90: "Zákroky brankáře/90", shots_faced: "Střely proti",
  shots_faced_per_90: "Střely proti/90", save_percentage: "Úspěšnost zákroků",
  punches: "Vyražené míče", punches_per_90: "Vyražené míče/90",
  pens_saved: "Chycené penalty",
  appearances: "Zápasy", minutes_played: "Minuty", avg_rating_: "Průměrné hodnocení",
  rank_in_league_top_attackers: "Pořadí v lize (útočníci)",
  rank_in_league_top_midfielders: "Pořadí v lize (záložníci)",
  rank_in_league_top_defenders: "Pořadí v lize (obránci)",
};

const DISPLAY_GROUP_COLS = {
  "Útočné": ["goals", "goals_per_90", "xg_per_90", "assists_per_90"],
  "Přihrávky": ["passes_per_90", "pass_completion_rate", "key_passes_per_90", "cross_completion_rate"],
  "Driblink": ["dribbles_per_90", "dribbles_successful_per_90", "dribbled_past_per_90"],
  "Obranné": ["tackles_per_90", "interceptions_per_90", "duels_won_per_90", "aerial_duels_won_per_90"],
  "Brankářské": ["save_percentage", "saves_per_90", "clean_sheets", "conceded_per_90"],
  "Obecné": ["appearances", "avg_rating_"],
};

const LOWER_IS_BETTER = new Set([
  "min_per_goal", "min_per_assist", "conceded_goals", "conceded_per_90",
  "dribbled_past", "dribbled_past_per_90",
  "rank_in_league_top_attackers", "rank_in_league_top_midfielders", "rank_in_league_top_defenders",
]);

const OUTFIELD_RADAR = ["goals_per_90", "xg_per_90", "assists_per_90", "xa_per_90", "key_passes_per_90", "dribbles_successful_per_90", "tackles_per_90", "interceptions_per_90"];
const GK_RADAR = ["save_percentage", "saves_per_90", "clean_sheets", "pass_completion_rate", "conceded_per_90"];

const BASE_COLS = ["player_name", "age", "position", "Current Club", "league_name", "season", "minutes_played"];
const STAT_OPTIONS = Object.entries(STAT_GROUPS).flatMap(([g, keys]) => keys.map((k) => [k, `${STAT_LABELS[k] || k} (${g})`]));

const TABS = [
  { id: "search", label: "Hledat" },
  { id: "compare", label: "Srovnání" },
  { id: "rankings", label: "Žebříčky" },
  { id: "data", label: "Data" },
];

/* ---------------------------------------------------------------------- */
/* Helpers                                                                 */
/* ---------------------------------------------------------------------- */

function formatStat(col, val) {
  if (val === null || val === undefined || val === "") return "–";
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  if (col.includes("percentage") || col.includes("rate")) return `${n.toFixed(1)}%`;
  if (col.endsWith("_per_90") || col === "avg_rating_") return n.toFixed(2);
  if (Number.isInteger(n)) return n.toLocaleString("cs-CZ");
  return n.toFixed(2);
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
  } catch {
    return iso || "–";
  }
}

function buildSorted(rows, stat) {
  const vals = [];
  for (const r of rows) {
    const v = r[stat];
    if (v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v))) vals.push(Number(v));
  }
  vals.sort((a, b) => a - b);
  return vals;
}

function percentileRank(sorted, value) {
  if (!sorted.length || value === null || value === undefined) return 0;
  const v = Number(value);
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return Math.round((lo / sorted.length) * 100);
}

function bestIndex(values, lowerBetter) {
  let best = -1, bestVal = null;
  values.forEach((v, i) => {
    if (v === null || v === undefined) return;
    const n = Number(v);
    if (bestVal === null || (lowerBetter ? n < bestVal : n > bestVal)) {
      bestVal = n;
      best = i;
    }
  });
  return best;
}

/* ---------------------------------------------------------------------- */
/* Styles                                                                  */
/* ---------------------------------------------------------------------- */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap');

.dosier * { box-sizing: border-box; }
.dosier {
  --bg: #F7F8FA; --panel: #FFFFFF; --panel-alt: #F0F2F5; --line: #E3E6EA;
  --ink: #12181F; --ink-dim: #67707B; --gold: #059669; --gold-soft: rgba(5,150,105,0.12);
  --good: #059669; --bad: #DC2626;
  background: var(--bg); color: var(--ink); font-family: 'Inter', sans-serif;
  min-height: 640px; display: flex; border-radius: 6px; overflow: hidden;
  border: 1px solid var(--line); box-shadow: 0 1px 3px rgba(16,24,32,0.06);
}
.dosier .sidebar { width: 200px; flex-shrink: 0; background: var(--panel); border-right: 1px solid var(--line); display: flex; flex-direction: column; padding: 22px 16px; }
.dosier .brand-title { font-family: 'Manrope', sans-serif; font-weight: 800; font-size: 21px; letter-spacing: -0.01em; }
.dosier .brand-sub { color: var(--ink-dim); font-size: 12px; margin-top: 2px; margin-bottom: 26px; }
.dosier .nav-item { text-align: left; background: none; border: none; color: var(--ink-dim); font-family: inherit; font-size: 14px; padding: 9px 10px; border-radius: 4px; cursor: pointer; margin-bottom: 2px; border-left: 2px solid transparent; }
.dosier .nav-item:hover { color: var(--ink); background: rgba(236,232,222,0.04); }
.dosier .nav-item.active { color: var(--gold); background: var(--gold-soft); border-left: 2px solid var(--gold); font-weight: 500; }
.dosier .sidebar-footer { margin-top: auto; padding-top: 16px; border-top: 1px solid var(--line); font-size: 12px; color: var(--ink-dim); line-height: 1.5; }
.dosier .content { flex: 1; min-width: 0; padding: 26px 30px; overflow-y: auto; max-height: 900px; }
.dosier .section-title { font-family: 'Manrope', sans-serif; font-size: 20px; font-weight: 700; margin: 0 0 4px; }
.dosier .section-sub { color: var(--ink-dim); font-size: 13px; margin: 0 0 18px; }
.dosier .kicker { color: var(--ink-dim); font-size: 11px; letter-spacing: 0.06em; margin-bottom: 6px; }
.dosier .field-label { font-size: 12px; color: var(--ink-dim); margin-bottom: 6px; }
.dosier .field { margin-bottom: 14px; }
.dosier input[type=text], .dosier input[type=number], .dosier select {
  background: var(--panel-alt); border: 1px solid var(--line); color: var(--ink); font-family: inherit;
  font-size: 13px; padding: 7px 9px; border-radius: 4px; outline: none;
}
.dosier input[type=text]:focus, .dosier input[type=number]:focus, .dosier select:focus { border-color: var(--gold); }
.dosier .filter-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px,1fr)); gap: 12px 16px; margin-bottom: 6px; }
.dosier .chip-row { display: flex; flex-wrap: wrap; gap: 6px; max-height: 110px; overflow-y: auto; padding: 2px; }
.dosier .chip { background: var(--panel-alt); border: 1px solid var(--line); color: var(--ink-dim); font-size: 12px; padding: 4px 9px; border-radius: 20px; cursor: pointer; font-family: inherit; }
.dosier .chip.active { color: #FFFFFF; background: var(--gold); border-color: var(--gold); font-weight: 500; }
.dosier .btn { font-family: inherit; font-size: 13px; padding: 8px 14px; border-radius: 4px; cursor: pointer; border: 1px solid var(--line); background: var(--panel-alt); color: var(--ink); }
.dosier .btn:hover { border-color: var(--gold); }
.dosier .btn-primary { background: var(--gold); color: #FFFFFF; border-color: var(--gold); font-weight: 500; }
.dosier .btn-ghost { background: none; border: none; color: var(--ink-dim); text-decoration: underline; padding: 4px 6px; }
.dosier .btn:disabled { opacity: 0.4; cursor: not-allowed; }
.dosier .hairline { border: none; border-top: 1px solid var(--line); margin: 18px 0; }
.dosier .table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 4px; }
.dosier table { border-collapse: collapse; width: 100%; font-size: 13px; }
.dosier th { text-align: left; padding: 8px 10px; color: var(--ink-dim); font-weight: 500; font-size: 11.5px; border-bottom: 1px solid var(--line); cursor: pointer; white-space: nowrap; background: var(--panel-alt); position: sticky; top: 0; }
.dosier th:hover { color: var(--gold); }
.dosier td { padding: 7px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.dosier tr:hover td { background: rgba(236,232,222,0.03); }
.dosier .num { font-family: 'Inter', sans-serif; text-align: right; font-variant-numeric: tabular-nums; }
.dosier .name-cell { font-weight: 500; }
.dosier .sub-cell { color: var(--ink-dim); font-size: 12px; }
.dosier .pagination { display: flex; align-items: center; gap: 10px; margin-top: 12px; font-size: 12px; color: var(--ink-dim); }
.dosier .empty-state { border: 1px dashed var(--line); border-radius: 6px; padding: 60px 24px; text-align: center; }
.dosier .upload-box { border: 1px dashed var(--line); border-radius: 6px; padding: 40px 24px; text-align: center; cursor: pointer; background: var(--panel-alt); }
.dosier .upload-box:hover { border-color: var(--gold); }
.dosier .upload-title { font-family: 'Manrope', sans-serif; font-weight: 700; font-size: 18px; margin-bottom: 4px; }
.dosier .upload-sub { color: var(--ink-dim); font-size: 13px; }
.dosier .toast { position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%); background: var(--panel); border: 1px solid var(--gold); color: var(--ink); padding: 10px 18px; border-radius: 4px; font-size: 13px; box-shadow: 0 4px 18px rgba(16,24,32,0.14); }
.dosier .chip-selected { display: inline-flex; align-items: center; gap: 8px; background: var(--panel-alt); border: 1px solid var(--line); border-radius: 20px; padding: 5px 6px 5px 12px; font-size: 13px; margin: 0 8px 8px 0; }
.dosier .chip-selected button { background: none; border: none; color: var(--ink-dim); cursor: pointer; font-size: 15px; line-height: 1; padding: 2px 6px; }
.dosier .stat-row { display: grid; grid-template-columns: 200px repeat(var(--n,2), 1fr); border-bottom: 1px solid var(--line); font-size: 13px; }
.dosier .stat-row > div { padding: 7px 10px; }
.dosier .stat-row .label { color: var(--ink-dim); }
.dosier .stat-row .best { color: var(--gold); font-weight: 600; }
.dosier .stat-head { font-weight: 700; font-family: 'Manrope', sans-serif; font-size: 15px; }
.dosier .group-title { font-size: 12px; color: var(--ink-dim); letter-spacing: 0.04em; margin: 18px 0 6px; }
.dosier .add-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 4px; border-bottom: 1px solid var(--line); font-size: 13px; }
.dosier .rank-num { color: var(--ink-dim); font-family: 'Inter', sans-serif; font-variant-numeric: tabular-nums; }
.dosier .confirm-box { border: 1px solid var(--bad); background: rgba(220,38,38,0.06); border-radius: 4px; padding: 14px 16px; margin-top: 10px; }
@media (max-width: 760px) {
  .dosier { flex-direction: column; }
  .dosier .sidebar { width: 100%; flex-direction: row; align-items: center; flex-wrap: wrap; padding: 14px 16px; }
  .dosier .brand-sub { display: none; }
  .dosier .sidebar-footer { display: none; }
  .dosier nav { display: flex; gap: 4px; margin-left: auto; }
}
`;

/* ---------------------------------------------------------------------- */
/* Small shared components                                                 */
/* ---------------------------------------------------------------------- */

function MultiToggle({ label, options, selected, onChange }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div className="chip-row">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className={selected.has(o) ? "chip active" : "chip"}
            onClick={() => {
              const next = new Set(selected);
              if (next.has(o)) next.delete(o);
              else next.add(o);
              onChange(next);
            }}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function SortableTh({ label, sortKey, sortState, onSort }) {
  const active = sortState.key === sortKey;
  return (
    <th onClick={() => onSort(sortKey)}>
      {label}{active ? (sortState.dir === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );
}

/* ---------------------------------------------------------------------- */
/* Search tab                                                              */
/* ---------------------------------------------------------------------- */

function SearchTab({ rows, positions, leagues, seasons, compareIds, onToggleCompare }) {
  const [filters, setFilters] = useState({
    text: "", club: "", nationality: "", ageMin: "", ageMax: "", minMinutes: "",
    positions: new Set(), leagues: new Set(), seasons: new Set(), statFilters: [],
  });
  const [sortState, setSortState] = useState({ key: null, dir: "desc" });
  const [displayGroup, setDisplayGroup] = useState("Útočné");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filters.text && !(r.player_name || "").toLowerCase().includes(filters.text.toLowerCase())) return false;
      if (filters.club && !(r["Current Club"] || "").toLowerCase().includes(filters.club.toLowerCase())) return false;
      if (filters.nationality && !(r.nationality || "").toLowerCase().includes(filters.nationality.toLowerCase())) return false;
      if (filters.positions.size && !filters.positions.has(r.position)) return false;
      if (filters.leagues.size && !filters.leagues.has(r.league_name)) return false;
      if (filters.seasons.size && !filters.seasons.has(r.season)) return false;
      if (filters.ageMin !== "" && (r.age ?? -Infinity) < Number(filters.ageMin)) return false;
      if (filters.ageMax !== "" && (r.age ?? Infinity) > Number(filters.ageMax)) return false;
      if (filters.minMinutes !== "" && (r.minutes_played ?? 0) < Number(filters.minMinutes)) return false;
      for (const sf of filters.statFilters) {
        if (sf.stat && sf.min !== "") {
          const v = r[sf.stat];
          if (v === null || v === undefined || Number(v) < Number(sf.min)) return false;
        }
      }
      return true;
    });
  }, [rows, filters]);

  const sorted = useMemo(() => {
    if (!sortState.key) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = a[sortState.key], vb = b[sortState.key];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      const na = typeof va === "number" ? va : Number(va);
      const nb = typeof vb === "number" ? vb : Number(vb);
      let cmp;
      if (!Number.isNaN(na) && !Number.isNaN(nb)) cmp = na - nb;
      else cmp = String(va).localeCompare(String(vb));
      return sortState.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortState]);

  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const maxPage = Math.max(0, Math.ceil(sorted.length / PAGE_SIZE) - 1);

  function onSort(key) {
    setPage(0);
    setSortState((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  }

  function addStatFilter() {
    setFilters((f) => ({ ...f, statFilters: [...f.statFilters, { stat: "", min: "" }] }));
  }
  function updateStatFilter(i, row) {
    setFilters((f) => {
      const next = [...f.statFilters];
      next[i] = row;
      return { ...f, statFilters: next };
    });
  }
  function removeStatFilter(i) {
    setFilters((f) => ({ ...f, statFilters: f.statFilters.filter((_, idx) => idx !== i) }));
  }

  const extraCols = DISPLAY_GROUP_COLS[displayGroup];

  return (
    <div>
      <div className="section-title">Hledat hráče</div>
      <div className="section-sub">{sorted.length.toLocaleString("cs-CZ")} hráčů odpovídá filtru z celkových {rows.length.toLocaleString("cs-CZ")}</div>

      <div className="filter-grid">
        <div className="field">
          <div className="field-label">Jméno hráče</div>
          <input type="text" value={filters.text} onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, text: e.target.value })); }} placeholder="např. Kanté" style={{ width: "100%" }} />
        </div>
        <div className="field">
          <div className="field-label">Klub</div>
          <input type="text" value={filters.club} onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, club: e.target.value })); }} placeholder="klub" style={{ width: "100%" }} />
        </div>
        <div className="field">
          <div className="field-label">Národnost</div>
          <input type="text" value={filters.nationality} onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, nationality: e.target.value })); }} placeholder="národnost" style={{ width: "100%" }} />
        </div>
        <div className="field">
          <div className="field-label">Věk od–do</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input type="number" value={filters.ageMin} onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, ageMin: e.target.value })); }} placeholder="min" style={{ width: "50%" }} />
            <input type="number" value={filters.ageMax} onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, ageMax: e.target.value })); }} placeholder="max" style={{ width: "50%" }} />
          </div>
        </div>
        <div className="field">
          <div className="field-label">Min. odehraných minut</div>
          <input type="number" value={filters.minMinutes} onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, minMinutes: e.target.value })); }} placeholder="0" style={{ width: "100%" }} />
        </div>
      </div>

      <MultiToggle label="Post" options={positions} selected={filters.positions} onChange={(s) => { setPage(0); setFilters((f) => ({ ...f, positions: s })); }} />
      <MultiToggle label="Liga" options={leagues} selected={filters.leagues} onChange={(s) => { setPage(0); setFilters((f) => ({ ...f, leagues: s })); }} />
      <MultiToggle label="Sezóna" options={seasons} selected={filters.seasons} onChange={(s) => { setPage(0); setFilters((f) => ({ ...f, seasons: s })); }} />

      <div className="field">
        <div className="field-label">Statistické filtry (minimální hodnota)</div>
        {filters.statFilters.map((row, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <select value={row.stat} onChange={(e) => updateStatFilter(i, { ...row, stat: e.target.value })}>
              <option value="">Vyber statistiku…</option>
              {STAT_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <span style={{ fontSize: 12, color: "var(--ink-dim)" }}>min.</span>
            <input type="number" value={row.min} onChange={(e) => updateStatFilter(i, { ...row, min: e.target.value })} style={{ width: 90 }} />
            <button className="btn-ghost" onClick={() => removeStatFilter(i)}>odebrat</button>
          </div>
        ))}
        <button className="btn" onClick={addStatFilter}>+ Přidat statistický filtr</button>
      </div>

      <hr className="hairline" />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div className="field-label" style={{ marginBottom: 0 }}>Zobrazit statistiky ze skupiny</div>
        <select value={displayGroup} onChange={(e) => setDisplayGroup(e.target.value)}>
          {Object.keys(STAT_GROUPS).map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <SortableTh label="Hráč" sortKey="player_name" sortState={sortState} onSort={onSort} />
              <SortableTh label="Věk" sortKey="age" sortState={sortState} onSort={onSort} />
              <th>Post</th>
              <th>Klub</th>
              <th>Liga</th>
              <th>Sezóna</th>
              <SortableTh label="Minuty" sortKey="minutes_played" sortState={sortState} onSort={onSort} />
              {extraCols.map((c) => <SortableTh key={c} label={STAT_LABELS[c] || c} sortKey={c} sortState={sortState} onSort={onSort} />)}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r._id}>
                <td>
                  <input type="checkbox" checked={compareIds.includes(r._id)} onChange={() => onToggleCompare(r)} />
                </td>
                <td className="name-cell">{r.player_name}</td>
                <td className="num">{r.age ?? "–"}</td>
                <td>{r.position}</td>
                <td className="sub-cell">{r["Current Club"] || "–"}</td>
                <td className="sub-cell">{r.league_name || "–"}</td>
                <td className="sub-cell">{r.season}</td>
                <td className="num">{formatStat("minutes_played", r.minutes_played)}</td>
                {extraCols.map((c) => <td key={c} className="num">{formatStat(c, r[c])}</td>)}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td colSpan={8 + extraCols.length} style={{ textAlign: "center", color: "var(--ink-dim)", padding: 24 }}>Žádný hráč neodpovídá zvoleným filtrům.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button className="btn" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>← Předchozí</button>
        <span>Strana {page + 1} z {maxPage + 1}</span>
        <button className="btn" disabled={page >= maxPage} onClick={() => setPage((p) => Math.min(maxPage, p + 1))}>Další →</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Compare tab                                                             */
/* ---------------------------------------------------------------------- */

function CompareTab({ rows, compareRows, onToggleCompare, onAdd }) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return rows.filter((r) => (r.player_name || "").toLowerCase().includes(q)).slice(0, 12);
  }, [rows, query]);

  const allGK = compareRows.length > 0 && compareRows.every((p) => p.position === "Goalkeeper");
  const radarStats = allGK ? GK_RADAR : OUTFIELD_RADAR;

  const sortedCache = useMemo(() => {
    const cache = {};
    radarStats.forEach((s) => { cache[s] = buildSorted(rows, s); });
    return cache;
  }, [rows, allGK]);

  const radarData = useMemo(() => {
    return radarStats.map((s) => {
      const entry = { stat: STAT_LABELS[s] || s };
      compareRows.forEach((p, idx) => {
        let pct = percentileRank(sortedCache[s], p[s]);
        if (LOWER_IS_BETTER.has(s)) pct = 100 - pct;
        entry["s" + idx] = pct;
      });
      return entry;
    });
  }, [compareRows, sortedCache, radarStats]);

  return (
    <div>
      <div className="section-title">Srovnání hráčů</div>
      <div className="section-sub">Vyber 2 až 4 hráče (konkrétní sezónu) pro detailní srovnání.</div>

      <div className="field">
        <div className="field-label">Přidat hráče</div>
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="hledat jméno…" style={{ width: 300 }} />
        {matches.length > 0 && (
          <div style={{ border: "1px solid var(--line)", borderRadius: 4, marginTop: 6, maxWidth: 500 }}>
            {matches.map((r) => (
              <div className="add-row" key={r._id}>
                <span>{r.player_name} <span className="sub-cell">— {r.position}, {r["Current Club"] || "?"}, {r.season}</span></span>
                <button className="btn" disabled={compareRows.length >= 4 || compareRows.some((p) => p._id === r._id)} onClick={() => onAdd(r)}>Přidat</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 10, marginBottom: 10 }}>
        {compareRows.map((p, idx) => (
          <span className="chip-selected" key={p._id} style={{ borderColor: COLORS[idx] }}>
            <span style={{ width: 8, height: 8, borderRadius: 8, background: COLORS[idx], display: "inline-block" }}></span>
            {p.player_name} ({p.season})
            <button onClick={() => onToggleCompare(p)}>×</button>
          </span>
        ))}
        {compareRows.length === 0 && <div className="sub-cell">Zatím nevybráno žádný hráč.</div>}
      </div>

      {compareRows.length < 2 ? (
        <div className="empty-state">
          <div className="upload-title">Vyber alespoň dva hráče</div>
          <div className="upload-sub">Použij vyhledávání výše, nebo si hráče označ zaškrtávacím políčkem na kartě Hledat.</div>
        </div>
      ) : (
        <>
          <hr className="hairline" />
          <div className="stat-head" style={{ marginBottom: 10 }}>Profil (percentil v rámci celé databáze)</div>
          <ResponsiveContainer width="100%" height={360}>
            <RadarChart data={radarData} outerRadius={125}>
              <PolarGrid stroke="rgba(18,24,31,0.12)" />
              <PolarAngleAxis dataKey="stat" tick={{ fill: "#12181F", fontSize: 12 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "#67707B", fontSize: 10 }} />
              {compareRows.map((p, idx) => (
                <Radar key={p._id} name={`${p.player_name} (${p.season})`} dataKey={"s" + idx} stroke={COLORS[idx]} fill={COLORS[idx]} fillOpacity={0.2} />
              ))}
              <Legend wrapperStyle={{ fontSize: 12, color: "#12181F" }} />
              <Tooltip contentStyle={{ background: "#FFFFFF", border: "1px solid #E3E6EA", color: "#12181F" }} />
            </RadarChart>
          </ResponsiveContainer>

          <hr className="hairline" />
          <div className="stat-head" style={{ marginBottom: 6 }}>Detailní srovnání</div>
          <div className="stat-row" style={{ "--n": compareRows.length, fontWeight: 500 }}>
            <div></div>
            {compareRows.map((p) => <div key={p._id}>{p.player_name}<div className="sub-cell">{p["Current Club"] || "–"}, {p.season}</div></div>)}
          </div>
          {Object.entries(STAT_GROUPS).map(([group, keys]) => (
            <div key={group}>
              <div className="group-title">{group}</div>
              {keys.map((k) => {
                const values = compareRows.map((p) => p[k]);
                const bi = bestIndex(values, LOWER_IS_BETTER.has(k));
                return (
                  <div className="stat-row" key={k} style={{ "--n": compareRows.length }}>
                    <div className="label">{STAT_LABELS[k] || k}</div>
                    {values.map((v, idx) => <div key={idx} className={idx === bi ? "best" : ""}>{formatStat(k, v)}</div>)}
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Rankings tab                                                            */
/* ---------------------------------------------------------------------- */

function RankingsTab({ rows, positions, leagues, seasons }) {
  const [stat, setStat] = useState("goals_per_90");
  const [posSel, setPosSel] = useState(new Set());
  const [leagueSel, setLeagueSel] = useState(new Set());
  const [seasonSel, setSeasonSel] = useState(new Set());
  const [minMinutes, setMinMinutes] = useState("450");

  const lowerBetter = LOWER_IS_BETTER.has(stat);

  const ranked = useMemo(() => {
    let list = rows.filter((r) => {
      if (posSel.size && !posSel.has(r.position)) return false;
      if (leagueSel.size && !leagueSel.has(r.league_name)) return false;
      if (seasonSel.size && !seasonSel.has(r.season)) return false;
      if (minMinutes !== "" && (r.minutes_played ?? 0) < Number(minMinutes)) return false;
      return r[stat] !== null && r[stat] !== undefined && r[stat] !== "";
    });
    list = [...list].sort((a, b) => (lowerBetter ? a[stat] - b[stat] : b[stat] - a[stat]));
    return list.slice(0, 50);
  }, [rows, posSel, leagueSel, seasonSel, minMinutes, stat, lowerBetter]);

  return (
    <div>
      <div className="section-title">Žebříčky</div>
      <div className="section-sub">Top 50 hráčů podle zvolené statistiky.</div>

      <div className="filter-grid">
        <div className="field">
          <div className="field-label">Statistika</div>
          <select value={stat} onChange={(e) => setStat(e.target.value)} style={{ width: "100%" }}>
            {STAT_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="field">
          <div className="field-label">Min. odehraných minut</div>
          <input type="number" value={minMinutes} onChange={(e) => setMinMinutes(e.target.value)} style={{ width: "100%" }} />
        </div>
      </div>

      <MultiToggle label="Post" options={positions} selected={posSel} onChange={setPosSel} />
      <MultiToggle label="Liga" options={leagues} selected={leagueSel} onChange={setLeagueSel} />
      <MultiToggle label="Sezóna" options={seasons} selected={seasonSel} onChange={setSeasonSel} />

      <hr className="hairline" />

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Hráč</th>
              <th>Post</th>
              <th>Klub</th>
              <th>Liga</th>
              <th>Sezóna</th>
              <th className="num">{STAT_LABELS[stat] || stat}</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r, i) => (
              <tr key={r._id}>
                <td className="rank-num">{i + 1}</td>
                <td className="name-cell">{r.player_name}</td>
                <td>{r.position}</td>
                <td className="sub-cell">{r["Current Club"] || "–"}</td>
                <td className="sub-cell">{r.league_name || "–"}</td>
                <td className="sub-cell">{r.season}</td>
                <td className="num">{formatStat(stat, r[stat])}</td>
              </tr>
            ))}
            {ranked.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--ink-dim)", padding: 24 }}>Žádný hráč neodpovídá zvoleným filtrům.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Data tab                                                                */
/* ---------------------------------------------------------------------- */

function DataTab({ dataset, loadError }) {
  return (
    <div>
      <div className="section-title">Databáze</div>
      <div className="section-sub">Data se generují při každém nasazení z Excel souboru uloženého v repozitáři na GitHubu.</div>

      {dataset && (
        <div style={{ marginBottom: 20, fontSize: 13, color: "var(--ink-dim)" }}>
          <div>Počet hráčů: <span style={{ color: "var(--ink)" }}>{dataset.rows.length.toLocaleString("cs-CZ")}</span></div>
          <div>Počet sloupců: <span style={{ color: "var(--ink)" }}>{dataset.columns.length}</span></div>
          <div>Poslední aktualizace (build): <span style={{ color: "var(--ink)" }}>{formatDate(dataset.meta.updatedAt)}</span></div>
        </div>
      )}

      {loadError && (
        <div className="confirm-box" style={{ marginBottom: 20 }}>
          Data se nepodařilo načíst: {loadError}
        </div>
      )}

      <div className="upload-box" style={{ cursor: "default", textAlign: "left" }}>
        <div className="upload-title" style={{ marginBottom: 10 }}>Jak aktualizovat databázi</div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.8 }}>
          <li>Vygeneruj novou <code>players.xlsx</code> svým Python skriptem.</li>
          <li>Nahraď jí soubor <code>data/players.xlsx</code> v GitHub repozitáři (commit + push, nebo přetažením v GitHub webu).</li>
          <li>Vercel automaticky spustí nový build, který soubor přepočítá na data pro aplikaci a nasadí novou verzi.</li>
        </ol>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* App root                                                                */
/* ---------------------------------------------------------------------- */

export default function App() {
  const [dataset, setDataset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("search");
  const [compareIds, setCompareIds] = useState([]);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3800);
  }, []);

  const [loadError, setLoadError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/data/players.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      const cols = payload.columns;
      const objRows = payload.rows.map((r, i) => {
        const o = { _id: i };
        cols.forEach((c, ci) => { o[c] = r[ci]; });
        o.season = o.season === null || o.season === undefined ? "" : String(o.season);
        return o;
      });
      setDataset({
        columns: cols,
        rows: objRows,
        meta: { updatedAt: payload.updatedAt, rowCount: payload.rowCount },
      });
    } catch (e) {
      console.error(e);
      setDataset(null);
      setLoadError(e.message || "neznámá chyba");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const positions = useMemo(() => dataset ? [...new Set(dataset.rows.map((r) => r.position).filter(Boolean))].sort() : [], [dataset]);
  const leagues = useMemo(() => dataset ? [...new Set(dataset.rows.map((r) => r.league_name).filter(Boolean))].sort() : [], [dataset]);
  const seasons = useMemo(() => dataset ? [...new Set(dataset.rows.map((r) => r.season).filter(Boolean))].sort() : [], [dataset]);

  const compareRows = useMemo(() => {
    if (!dataset) return [];
    return compareIds.map((id) => dataset.rows.find((r) => r._id === id)).filter(Boolean);
  }, [dataset, compareIds]);

  function toggleCompare(row) {
    setCompareIds((ids) => {
      if (ids.includes(row._id)) return ids.filter((id) => id !== row._id);
      if (ids.length >= 4) {
        showToast("Můžeš srovnávat maximálně 4 hráče najednou.");
        return ids;
      }
      return [...ids, row._id];
    });
  }

  return (
    <div className="dosier" style={{ position: "relative" }}>
      <style>{CSS}</style>
      <aside className="sidebar">
        <div>
          <div className="brand-title">Dosier</div>
          <div className="brand-sub">skautovací nástroj</div>
        </div>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "nav-item active" : "nav-item"} onClick={() => setTab(t.id)}>
              {t.label}{t.id === "compare" && compareIds.length > 0 ? ` (${compareIds.length})` : ""}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          {dataset ? (
            <>{dataset.rows.length.toLocaleString("cs-CZ")} hráčů<br />aktualizace {formatDate(dataset.meta.updatedAt)}</>
          ) : (
            <>Žádná data</>
          )}
        </div>
      </aside>

      <main className="content">
        {loading ? (
          <div className="empty-state"><div className="upload-title">Načítám databázi…</div></div>
        ) : !dataset ? (
          tab === "data" ? (
            <DataTab dataset={dataset} loadError={loadError} />
          ) : (
            <div className="empty-state">
              <div className="upload-title">Databázi se nepodařilo načíst</div>
              <div className="upload-sub" style={{ marginBottom: 18 }}>
                {loadError ? `Chyba: ${loadError}. ` : ""}Zkontroluj kartu „Data" pro instrukce, jak databázi doplnit.
              </div>
            </div>
          )
        ) : (
          <>
            {tab === "search" && <SearchTab rows={dataset.rows} positions={positions} leagues={leagues} seasons={seasons} compareIds={compareIds} onToggleCompare={toggleCompare} />}
            {tab === "compare" && <CompareTab rows={dataset.rows} compareRows={compareRows} onToggleCompare={toggleCompare} onAdd={toggleCompare} />}
            {tab === "rankings" && <RankingsTab rows={dataset.rows} positions={positions} leagues={leagues} seasons={seasons} />}
            {tab === "data" && <DataTab dataset={dataset} loadError={loadError} />}
          </>
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
