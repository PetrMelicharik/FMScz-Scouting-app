"use client";
import React, { useState, useEffect, useMemo } from "react";

const PAGE_SIZE = 50;

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

const STAT_OPTIONS = Object.entries(STAT_GROUPS).flatMap(([g, keys]) => keys.map((k) => [k, `${STAT_LABELS[k] || k} (${g})`]));

function formatStat(col, val) {
  if (val === null || val === undefined || val === "") return "–";
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  if (col.includes("percentage") || col.includes("rate")) return `${n.toFixed(1)}%`;
  if (col.endsWith("_per_90") || col === "avg_rating_") return n.toFixed(2);
  if (Number.isInteger(n)) return n.toLocaleString("cs-CZ");
  return n.toFixed(2);
}

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

export default function DatabaseView() {
  const [dataset, setDataset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch("/data/players.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        if (cancelled) return;
        const cols = payload.columns;
        const objRows = payload.rows.map((r, i) => {
          const o = { _id: i };
          cols.forEach((c, ci) => { o[c] = r[ci]; });
          o.season = o.season === null || o.season === undefined ? "" : String(o.season);
          return o;
        });
        setDataset({ columns: cols, rows: objRows });
      } catch (e) {
        if (cancelled) return;
        console.error(e);
        setLoadError(e.message || "neznámá chyba");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const [filters, setFilters] = useState({
    text: "", club: "", nationality: "", ageMin: "", ageMax: "", minMinutes: "",
    positions: new Set(), leagues: new Set(), seasons: new Set(), statFilters: [],
  });
  const [sortState, setSortState] = useState({ key: null, dir: "desc" });
  const [displayGroup, setDisplayGroup] = useState("Útočné");
  const [page, setPage] = useState(0);

  const rows = dataset ? dataset.rows : [];

  const positions = useMemo(() => [...new Set(rows.map((r) => r.position).filter(Boolean))].sort(), [rows]);
  const leagues = useMemo(() => [...new Set(rows.map((r) => r.league_name).filter(Boolean))].sort(), [rows]);
  const seasons = useMemo(() => [...new Set(rows.map((r) => r.season).filter(Boolean))].sort(), [rows]);

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
      <div className="db-header">
        <h1 className="db-title">Databáze hráčů</h1>
        <p className="db-subtitle">
          {loading ? "Načítám databázi…" : dataset ? `${sorted.length.toLocaleString("cs-CZ")} hráčů odpovídá filtru z celkových ${rows.length.toLocaleString("cs-CZ")}` : "Databázi se nepodařilo načíst."}
        </p>
      </div>

      {loadError && (
        <div className="empty-state" style={{ marginBottom: 24 }}>
          <div className="empty-title">Data se nepodařilo načíst</div>
          <div className="empty-sub">Chyba: {loadError}</div>
        </div>
      )}

      {!loading && dataset && (
        <>
          <div className="filter-panel">
            <div className="filter-grid">
              <div className="field">
                <div className="field-label">Jméno hráče</div>
                <input type="text" value={filters.text} onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, text: e.target.value })); }} placeholder="např. Kanté" />
              </div>
              <div className="field">
                <div className="field-label">Klub</div>
                <input type="text" value={filters.club} onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, club: e.target.value })); }} placeholder="klub" />
              </div>
              <div className="field">
                <div className="field-label">Národnost</div>
                <input type="text" value={filters.nationality} onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, nationality: e.target.value })); }} placeholder="národnost" />
              </div>
              <div className="field">
                <div className="field-label">Věk od–do</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input type="number" value={filters.ageMin} onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, ageMin: e.target.value })); }} placeholder="min" />
                  <input type="number" value={filters.ageMax} onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, ageMax: e.target.value })); }} placeholder="max" />
                </div>
              </div>
              <div className="field">
                <div className="field-label">Min. odehraných minut</div>
                <input type="number" value={filters.minMinutes} onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, minMinutes: e.target.value })); }} placeholder="0" />
              </div>
            </div>

            <MultiToggle label="Post" options={positions} selected={filters.positions} onChange={(s) => { setPage(0); setFilters((f) => ({ ...f, positions: s })); }} />
            <MultiToggle label="Liga" options={leagues} selected={filters.leagues} onChange={(s) => { setPage(0); setFilters((f) => ({ ...f, leagues: s })); }} />
            <MultiToggle label="Sezóna" options={seasons} selected={filters.seasons} onChange={(s) => { setPage(0); setFilters((f) => ({ ...f, seasons: s })); }} />

            <div className="field">
              <div className="field-label">Statistické filtry (minimální hodnota)</div>
              {filters.statFilters.map((row, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <select value={row.stat} onChange={(e) => updateStatFilter(i, { ...row, stat: e.target.value })} style={{ width: "auto" }}>
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
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div className="field-label" style={{ marginBottom: 0 }}>Zobrazit statistiky ze skupiny</div>
            <select value={displayGroup} onChange={(e) => setDisplayGroup(e.target.value)} style={{ width: "auto" }}>
              {Object.keys(STAT_GROUPS).map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
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
                  <tr><td colSpan={7 + extraCols.length} style={{ textAlign: "center", color: "var(--ink-dim)", padding: 24 }}>Žádný hráč neodpovídá zvoleným filtrům.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <button className="btn" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>← Předchozí</button>
            <span>Strana {page + 1} z {maxPage + 1}</span>
            <button className="btn" disabled={page >= maxPage} onClick={() => setPage((p) => Math.min(maxPage, p + 1))}>Další →</button>
          </div>
        </>
      )}

      {loading && (
        <div className="empty-state">
          <div className="empty-title">Načítám databázi…</div>
        </div>
      )}
    </div>
  );
}
