"use client";
import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Avatar from "./Avatar";
import { formatStat } from "../lib/statMeta";
import { flagUrl } from "../lib/countryFlags";

const PAGE_SIZE = 48;

const SORT_OPTIONS = [
  ["avg_rating_", "Rating"],
  ["goals", "Góly"],
  ["assists", "Asistence"],
  ["goals_per_90", "Góly/90"],
  ["minutes_played", "Minuty"],
  ["age", "Věk"],
];

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

function PlayerCard({ p }) {
  return (
    <Link href={`/databaze/${p._id}`} className="player-card">
      <div className="player-card-head">
        <Avatar src={p.photo_url} size={60} />
        <div className="player-card-head-text">
          <div className="player-name">{p.player_name}</div>
          <div className="player-club">
            {p.club_logo_url && (
              <img src={p.club_logo_url} alt="" className="club-logo-mini" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            )}
            {p["Current Club"] || "–"}
          </div>
          {(p.tm_position || p.position) && <div className="player-badge">{p.tm_position || p.position}</div>}
        </div>
      </div>
      <div className="player-stats">
        <div className="stat-box">
          <div className="stat-box-label">Věk</div>
          <div className="stat-box-value">{p.age ?? "–"}</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Zápasy</div>
          <div className="stat-box-value">{p.appearances ?? "–"}</div>
        </div>
        <div className="stat-box stat-box-wide">
          <div className="stat-box-label">Národnost</div>
          <div className="stat-box-value stat-box-value-sm stat-box-flag">
            {flagUrl(p.nationality) && (
              <img src={flagUrl(p.nationality)} alt="" className="flag-mini" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            )}
            {p.nationality || "–"}
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Góly/Ass</div>
          <div className="stat-box-value">{(p.goals ?? 0)}/{(p.assists ?? 0)}</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Rating</div>
          <div className="stat-box-value">{formatStat("avg_rating_", p.avg_rating_)}</div>
        </div>
      </div>
      <div className="player-footer">
        {p.league_logo_url ? (
          <img src={p.league_logo_url} alt="" className="league-logo-mini" onError={(e) => { e.currentTarget.style.display = "none"; }} />
        ) : (
          <span className="dot"></span>
        )}
        {p.league_name || "–"} ({p.season})
      </div>
    </Link>
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
    text: "", club: "", nationality: "", league: "",
    ageMin: null, ageMax: null, minMinutes: "", seasons: new Set(),
  });
  const [sortState, setSortState] = useState({ key: "avg_rating_", dir: "desc" });
  const [page, setPage] = useState(0);

  const rows = dataset ? dataset.rows : [];

  const leagues = useMemo(() => [...new Set(rows.map((r) => r.league_name).filter(Boolean))].sort(), [rows]);
  const clubs = useMemo(() => {
    const source = filters.league ? rows.filter((r) => r.league_name === filters.league) : rows;
    return [...new Set(source.map((r) => r["Current Club"]).filter(Boolean))].sort();
  }, [rows, filters.league]);
  const seasons = useMemo(() => [...new Set(rows.map((r) => r.season).filter(Boolean))].sort(), [rows]);

  const ageDomain = useMemo(() => {
    let min = Infinity, max = -Infinity;
    rows.forEach((r) => {
      if (typeof r.age === "number" && !Number.isNaN(r.age)) {
        if (r.age < min) min = r.age;
        if (r.age > max) max = r.age;
      }
    });
    if (!Number.isFinite(min)) return [14, 45];
    return [min, max];
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filters.text && !(r.player_name || "").toLowerCase().includes(filters.text.toLowerCase())) return false;
      if (filters.club && r["Current Club"] !== filters.club) return false;
      if (filters.nationality && !(r.nationality || "").toLowerCase().includes(filters.nationality.toLowerCase())) return false;
      if (filters.league && r.league_name !== filters.league) return false;
      if (filters.seasons.size && !filters.seasons.has(r.season)) return false;
      if (filters.ageMin !== null && (r.age ?? -Infinity) < filters.ageMin) return false;
      if (filters.ageMax !== null && (r.age ?? Infinity) > filters.ageMax) return false;
      if (filters.minMinutes !== "" && (r.minutes_played ?? 0) < Number(filters.minMinutes)) return false;
      return true;
    });
  }, [rows, filters]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = a[sortState.key], vb = b[sortState.key];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      const cmp = Number(va) - Number(vb);
      return sortState.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortState]);

  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const maxPage = Math.max(0, Math.ceil(sorted.length / PAGE_SIZE) - 1);

  const ageMinValue = filters.ageMin ?? ageDomain[0];
  const ageMaxValue = filters.ageMax ?? ageDomain[1];

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
                <div className="field-label">Národnost</div>
                <input type="text" value={filters.nationality} onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, nationality: e.target.value })); }} placeholder="národnost" />
              </div>
              <div className="field">
                <div className="field-label">Liga</div>
                <select
                  value={filters.league}
                  onChange={(e) => {
                    setPage(0);
                    const league = e.target.value;
                    setFilters((f) => {
                      const source = league ? rows.filter((r) => r.league_name === league) : rows;
                      const stillValid = source.some((r) => r["Current Club"] === f.club);
                      return { ...f, league, club: stillValid ? f.club : "" };
                    });
                  }}
                >
                  <option value="">Všechny ligy</option>
                  {leagues.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="field">
                <div className="field-label">Klub</div>
                <select value={filters.club} onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, club: e.target.value })); }}>
                  <option value="">Všechny kluby</option>
                  {clubs.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <div className="field-label">Min. odehraných minut</div>
                <input type="number" value={filters.minMinutes} onChange={(e) => { setPage(0); setFilters((f) => ({ ...f, minMinutes: e.target.value })); }} placeholder="0" />
              </div>
            </div>

            <div className="field">
              <div className="field-label">Věk: {ageMinValue} – {ageMaxValue}</div>
              <div className="dual-slider">
                <div className="dual-slider-col">
                  <span className="dual-slider-tag">od</span>
                  <input
                    type="range"
                    min={ageDomain[0]}
                    max={ageDomain[1]}
                    value={ageMinValue}
                    onChange={(e) => {
                      setPage(0);
                      const v = Number(e.target.value);
                      setFilters((f) => ({ ...f, ageMin: Math.min(v, f.ageMax ?? ageDomain[1]) }));
                    }}
                  />
                </div>
                <div className="dual-slider-col">
                  <span className="dual-slider-tag">do</span>
                  <input
                    type="range"
                    min={ageDomain[0]}
                    max={ageDomain[1]}
                    value={ageMaxValue}
                    onChange={(e) => {
                      setPage(0);
                      const v = Number(e.target.value);
                      setFilters((f) => ({ ...f, ageMax: Math.max(v, f.ageMin ?? ageDomain[0]) }));
                    }}
                  />
                </div>
              </div>
            </div>

            <MultiToggle label="Sezóna" options={seasons} selected={filters.seasons} onChange={(s) => { setPage(0); setFilters((f) => ({ ...f, seasons: s })); }} />
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div className="field-label" style={{ marginBottom: 0 }}>Řadit podle</div>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={sortState.key} onChange={(e) => setSortState((s) => ({ ...s, key: e.target.value }))} style={{ width: "auto" }}>
                {SORT_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button className="btn" onClick={() => setSortState((s) => ({ ...s, dir: s.dir === "desc" ? "asc" : "desc" }))}>
                {sortState.dir === "desc" ? "↓ sestupně" : "↑ vzestupně"}
              </button>
            </div>
          </div>

          {pageRows.length > 0 ? (
            <div className="player-grid">
              {pageRows.map((p) => <PlayerCard key={p._id} p={p} />)}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-title">Žádný hráč neodpovídá filtru</div>
              <div className="empty-sub">Zkus filtry uvolnit nebo rozšířit.</div>
            </div>
          )}

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
