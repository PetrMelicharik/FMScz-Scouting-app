"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { playerHref } from "../lib/playerUrl";
import Avatar from "./Avatar";
import { STAT_LABELS, formatStat } from "../lib/statMeta";
import {
  classifyPizzaGroup, PIZZA_GROUP_LABELS, CATEGORY_LABELS, CATEGORY_COLORS,
  SCOUTING_OUTFIELD_STATS, GK_STATS, rankPlayersByStats, parseMarketValue,
  buildLeagueMinMinutes, minMinutesFor,
} from "../lib/pizzaShared";
import { SPECIFIC_POSITIONS, matchesSpecificPositions, positionLabel, otherPositions } from "../lib/positions";
import PositionPicker from "./PositionPicker";

const GROUP_ORDER = ["GK", "CB", "FB", "CM", "CAM", "WING", "FW"];
const TOP_N_OPTIONS = [10, 20, 30, 50];

function scoreColor(score) {
  return score >= 80 ? "#4CB848" : score >= 60 ? "#D97706" : "#DC2626";
}

// Transfermarkt contract end comes as "30/06/2027" (DD/MM/YYYY) → "2027-06-30",
// so it can be compared as a plain string. null when missing/unparseable.
function parseContractDate(raw) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(raw ?? "").trim());
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

// "Contract ends by" choices, relative to today: the next four transfer-window
// deadlines (30 June / 31 December). Players whose contract already ended
// (free agents) are included too, since their date is before the deadline.
function contractDeadlineOptions() {
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

export default function ScoutingTool() {
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
        const rows = payload.rows.map((r, i) => {
          const o = { _id: i };
          cols.forEach((c, ci) => { o[c] = r[ci]; });
          return o;
        });
        setDataset({ rows });
      } catch (e) {
        if (cancelled) return;
        setLoadError(e.message || "neznámá chyba");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const rows = dataset ? dataset.rows : [];

  const ageDomain = useMemo(() => {
    let min = Infinity, max = -Infinity;
    rows.forEach((r) => {
      if (typeof r.age === "number" && !Number.isNaN(r.age)) {
        if (r.age < min) min = r.age;
        if (r.age > max) max = r.age;
      }
    });
    return Number.isFinite(min) ? [min, max] : [14, 45];
  }, [rows]);

  const leagues = useMemo(() => [...new Set(rows.map((r) => r.league_name).filter(Boolean))].sort(), [rows]);

  const [group, setGroup] = useState("");
  const [ageMin, setAgeMin] = useState(null);
  const [ageMax, setAgeMax] = useState(null);
  const [league, setLeague] = useState("");
  // Prázdné = hranice podle ligy (40 % odehratelných minut, min. 300); číslo = pro všechny stejně
  const [minMinutes, setMinMinutes] = useState("");
  const leagueMin = useMemo(() => buildLeagueMinMinutes(rows.map((r) => [r.league_name, r.minutes_played])), [rows]);
  const [maxValueM, setMaxValueM] = useState("");
  const [contractBy, setContractBy] = useState(""); // ISO date "YYYY-MM-DD" — contract ends on/before it
  const contractOptions = useMemo(() => contractDeadlineOptions(), []);
  // Preferovaná noha: "" = bez omezení, "right"/"left" zahrnují i obounohé, "both" = jen obounozí
  const [foot, setFoot] = useState("");
  // Konkrétní pozice z Transfermarktu (např. "Right Winger"); prázdné = jen podle skupiny pozic
  const [specPositions, setSpecPositions] = useState([]);
  const [includeOther, setIncludeOther] = useState(true);
  const [selectedStats, setSelectedStats] = useState(new Set());
  const [topN, setTopN] = useState(20);
  const [sortKey, setSortKey] = useState("score");
  const [sortDir, setSortDir] = useState("desc");

  const statList = group === "GK" ? GK_STATS : group ? SCOUTING_OUTFIELD_STATS : [];

  // Restore the filter/stat/sort state from the URL on first load — so the
  // browser's back button (after clicking through to a player's profile)
  // returns to the same set-up search instead of a reset one.
  const restoringRef = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if ([...params.keys()].length === 0) return;
    restoringRef.current = true;
    if (params.has("group")) setGroup(params.get("group"));
    if (params.has("league")) setLeague(params.get("league"));
    if (params.has("min")) setMinMinutes(params.get("min"));
    if (params.has("maxv")) setMaxValueM(params.get("maxv"));
    if (params.has("contract")) setContractBy(params.get("contract"));
    if (params.has("foot")) setFoot(params.get("foot"));
    if (params.has("pos")) setSpecPositions(params.get("pos").split(",").filter(Boolean));
    if (params.get("other") === "0") setIncludeOther(false);
    if (params.has("ageMin")) setAgeMin(Number(params.get("ageMin")));
    if (params.has("ageMax")) setAgeMax(Number(params.get("ageMax")));
    if (params.has("stats")) setSelectedStats(new Set(params.get("stats").split(",").filter(Boolean)));
    if (params.has("topN")) setTopN(Number(params.get("topN")) || 20);
    if (params.has("sort")) setSortKey(params.get("sort"));
    if (params.has("dir")) setSortDir(params.get("dir"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the URL in sync with the current filters/stats/sort, without adding
  // a new history entry per change (replaceState, not pushState).
  useEffect(() => {
    const params = new URLSearchParams();
    if (group) params.set("group", group);
    if (league) params.set("league", league);
    if (minMinutes !== "") params.set("min", minMinutes);
    if (maxValueM !== "") params.set("maxv", maxValueM);
    if (contractBy) params.set("contract", contractBy);
    if (foot) params.set("foot", foot);
    if (specPositions.length) params.set("pos", specPositions.join(","));
    if (!includeOther) params.set("other", "0");
    if (ageMin !== null) params.set("ageMin", String(ageMin));
    if (ageMax !== null) params.set("ageMax", String(ageMax));
    if (selectedStats.size) params.set("stats", [...selectedStats].join(","));
    if (topN !== 20) params.set("topN", String(topN));
    if (sortKey !== "score") params.set("sort", sortKey);
    if (sortDir !== "desc") params.set("dir", sortDir);
    const qs = params.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [group, league, minMinutes, maxValueM, contractBy, foot, specPositions, includeOther, ageMin, ageMax, selectedStats, topN, sortKey, sortDir]);

  // When the position group changes, drop any selected stats that no longer
  // belong to that group's stat catalog (GK vs outfield lists don't overlap).
  // The very first run (mount, group still "") is always a no-op anyway, so
  // it's skipped outright; that leaves the *next* run — the one triggered by
  // the restore effect's setGroup(...) — as the one restoringRef guards,
  // so a URL restore doesn't wipe the stats/sort we just restored for it.
  const isFirstGroupRunRef = useRef(true);
  useEffect(() => {
    if (isFirstGroupRunRef.current) { isFirstGroupRunRef.current = false; return; }
    if (restoringRef.current) { restoringRef.current = false; return; }
    setSelectedStats((prev) => {
      const validKeys = new Set(statList.map(([k]) => k));
      const next = new Set([...prev].filter((k) => validKeys.has(k)));
      return next.size === prev.size ? prev : next;
    });
    setSortKey("score");
  }, [group]); // eslint-disable-line react-hooks/exhaustive-deps

  const ageMinValue = ageMin ?? ageDomain[0];
  const ageMaxValue = ageMax ?? ageDomain[1];

  // Konkrétní pozice nabízené ke skupině: u brankářů jen brankář, jinak hráči v poli
  const positionOptions = group === "GK"
    ? SPECIFIC_POSITIONS.filter(([v]) => v === "Goalkeeper")
    : SPECIFIC_POSITIONS.filter(([v]) => v !== "Goalkeeper");
  const activeSpec = specPositions.filter((p) => positionOptions.some(([v]) => v === p));

  const pool = useMemo(() => {
    if (!group) return [];
    const pevneMin = minMinutes !== "" ? Number(minMinutes) || 0 : null;
    const maxValue = maxValueM !== "" ? Number(maxValueM) * 1_000_000 : null;
    return rows.filter((r) => {
      // Zvolené konkrétní pozice nahrazují skupinu pozic (skupina pak určuje
      // jen nabídku metrik) – jinak by hráč s vedlejší pozicí z jiné skupiny vypadl.
      if (activeSpec.length) {
        if (!matchesSpecificPositions(r, activeSpec, includeOther)) return false;
      } else if (classifyPizzaGroup(r.tm_position || r.position) !== group) return false;
      if ((r.minutes_played ?? 0) < (pevneMin ?? minMinutesFor(leagueMin, r.league_name))) return false;
      if ((r.age ?? -Infinity) < ageMinValue || (r.age ?? Infinity) > ageMaxValue) return false;
      if (league && r.league_name !== league) return false;
      if (maxValue !== null) {
        const v = parseMarketValue(r.market_value);
        if (v === null || v > maxValue) return false;
      }
      if (contractBy) {
        const end = parseContractDate(r.contract_until);
        if (!end || end > contractBy) return false;
      }
      if (foot) {
        // Hráč bez známé nohy při zvoleném filtru vypadne (stejně jako u hodnoty a smlouvy)
        const f = (r.foot || "").toLowerCase();
        if (!f) return false;
        if (foot === "both" ? f !== "both" : f !== foot && f !== "both") return false;
      }
      return true;
    });
  }, [rows, leagueMin, group, minMinutes, ageMinValue, ageMaxValue, league, maxValueM, contractBy, foot, activeSpec.join("|"), includeOther]); // eslint-disable-line react-hooks/exhaustive-deps

  const statKeys = [...selectedStats];

  const ranked = useMemo(() => {
    if (!group || statKeys.length === 0) return [];
    return rankPlayersByStats(pool, statKeys, { topN });
  }, [pool, statKeys.join("|"), topN, group]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => {
    const arr = [...ranked];
    arr.sort((a, b) => {
      let va, vb;
      if (sortKey === "score") { va = a.score; vb = b.score; }
      else if (sortKey === "age") { va = a.player.age ?? -Infinity; vb = b.player.age ?? -Infinity; }
      else if (sortKey === "market_value") { va = parseMarketValue(a.player.market_value) ?? -Infinity; vb = parseMarketValue(b.player.market_value) ?? -Infinity; }
      else { va = a.perStat[sortKey]?.percentile ?? -1; vb = b.perStat[sortKey]?.percentile ?? -1; }
      const cmp = va - vb;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [ranked, sortKey, sortDir]);

  function toggleStat(key) {
    setSelectedStats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function sortArrow(key) {
    if (sortKey !== key) return "";
    return sortDir === "desc" ? " ↓" : " ↑";
  }

  return (
    <div>
      <div className="db-header">
        <h1 className="db-title">Scouting tool</h1>
        <p className="db-subtitle">
          Zvol pozici a metriky, podle kterých chceš hráče hledat — nástroj je seřadí podle percentilové shody napříč zvolenými statistikami.
        </p>
      </div>

      {loadError && (
        <div className="empty-state" style={{ marginBottom: 24 }}>
          <div className="empty-title">Data se nepodařilo načíst</div>
          <div className="empty-sub">Chyba: {loadError}</div>
        </div>
      )}

      {loading && (
        <div className="empty-state">
          <div className="empty-title">Načítám databázi…</div>
        </div>
      )}

      {!loading && dataset && (
        <>
          <div className="filter-panel">
            <div className="filter-grid">
              <div className="field">
                <div className="field-label">Pozice</div>
                <select value={group} onChange={(e) => setGroup(e.target.value)}>
                  <option value="">Vyber pozici…</option>
                  {GROUP_ORDER.map((g) => <option key={g} value={g}>{PIZZA_GROUP_LABELS[g]}</option>)}
                </select>
              </div>
              <div className="field">
                <div className="field-label">Liga</div>
                <select value={league} onChange={(e) => setLeague(e.target.value)}>
                  <option value="">Všechny ligy</option>
                  {leagues.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="field">
                <div className="field-label">Min. odehraných minut</div>
                <input type="number" value={minMinutes} onChange={(e) => setMinMinutes(e.target.value)}
                  placeholder={league ? `podle ligy (${minMinutesFor(leagueMin, league)})` : "podle ligy"}
                  title="Prázdné = 40 % minut odehratelných v lize hráče (min. 300). Číslo = stejná hranice pro všechny." />
              </div>
              <div className="field">
                <div className="field-label">Max. tržní hodnota (mil. €)</div>
                <input type="number" step="0.1" min="0" value={maxValueM} onChange={(e) => setMaxValueM(e.target.value)} placeholder="bez omezení" />
              </div>
              <div className="field">
                <div className="field-label">Končící smlouva</div>
                <select value={contractBy} onChange={(e) => setContractBy(e.target.value)}>
                  <option value="">Bez omezení</option>
                  {contractOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  {contractBy && !contractOptions.some(([v]) => v === contractBy) && <option value={contractBy}>Do {contractBy}</option>}
                </select>
              </div>
              <div className="field">
                <div className="field-label">Preferovaná noha</div>
                <select value={foot} onChange={(e) => setFoot(e.target.value)}>
                  <option value="">Bez omezení</option>
                  <option value="right">Pravá</option>
                  <option value="left">Levá</option>
                  <option value="both">Obě</option>
                </select>
              </div>
            </div>

            <div className="field">
              <div className="field-label">Věk: {ageMinValue} – {ageMaxValue}</div>
              <div className="dual-slider">
                <div className="dual-slider-col">
                  <span className="dual-slider-tag">od</span>
                  <input
                    type="range" min={ageDomain[0]} max={ageDomain[1]} value={ageMinValue}
                    onChange={(e) => { const v = Number(e.target.value); setAgeMin(Math.min(v, ageMax ?? ageDomain[1])); }}
                  />
                </div>
                <div className="dual-slider-col">
                  <span className="dual-slider-tag">do</span>
                  <input
                    type="range" min={ageDomain[0]} max={ageDomain[1]} value={ageMaxValue}
                    onChange={(e) => { const v = Number(e.target.value); setAgeMax(Math.max(v, ageMin ?? ageDomain[0])); }}
                  />
                </div>
              </div>
            </div>

            {group && group !== "GK" && (
              <PositionPicker
                value={activeSpec}
                onChange={setSpecPositions}
                includeOther={includeOther}
                onIncludeOtherChange={setIncludeOther}
                options={positionOptions}
                hint="(když nějakou zvolíš, hráči se vyberou podle ní místo skupiny)"
              />
            )}

            {group && (
              <div className="field" style={{ marginBottom: 0 }}>
                <div className="field-label">
                  Metriky ({selectedStats.size} zvoleno) — {PIZZA_GROUP_LABELS[group]}
                </div>
                <div className="chip-row" style={{ maxHeight: 160 }}>
                  {statList.map(([key, category]) => (
                    <button
                      key={key}
                      type="button"
                      className={selectedStats.has(key) ? "chip active" : "chip"}
                      style={!selectedStats.has(key) ? { borderColor: CATEGORY_COLORS[category] + "66" } : undefined}
                      onClick={() => toggleStat(key)}
                      title={CATEGORY_LABELS[category]}
                    >
                      {STAT_LABELS[key] || key}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!group && (
            <div className="empty-state">
              <div className="empty-title">Nejdřív zvol pozici</div>
              <div className="empty-sub">Podle pozice se nabídnou relevantní metriky (útočné, přihrávkové, obranné, brankářské…).</div>
            </div>
          )}

          {group && selectedStats.size === 0 && (
            <div className="empty-state">
              <div className="empty-title">Zvol aspoň jednu metriku</div>
              <div className="empty-sub">Klidně jich vyber víc — hráči se seřadí podle průměrné percentilové shody napříč všemi zvolenými.</div>
            </div>
          )}

          {group && selectedStats.size > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                <div className="field-label" style={{ marginBottom: 0 }}>
                  {sorted.length > 0
                    ? `${sorted.length} hráčů odpovídá kritériím (z poolu ${pool.length.toLocaleString("cs-CZ")})`
                    : "Žádný hráč neodpovídá kritériím"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="field-label" style={{ marginBottom: 0 }}>Počet výsledků</span>
                  <select value={topN} onChange={(e) => setTopN(Number(e.target.value))} style={{ width: "auto" }}>
                    {TOP_N_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              {sorted.length > 0 ? (
                <div className="scout-table-wrap">
                  <table className="scout-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Hráč</th>
                        <th className="scout-th-sortable" onClick={() => toggleSort("age")}>Věk{sortArrow("age")}</th>
                        <th>Pozice</th>
                        <th>Liga</th>
                        <th className="scout-th-sortable" onClick={() => toggleSort("market_value")}>Tržní hodnota{sortArrow("market_value")}</th>
                        {statKeys.map((key) => (
                          <th key={key} className="scout-th-sortable" onClick={() => toggleSort(key)}>
                            {STAT_LABELS[key] || key}{sortArrow(key)}
                          </th>
                        ))}
                        <th className="scout-th-sortable" onClick={() => toggleSort("score")}>Shoda{sortArrow("score")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map(({ player: p, perStat, score }, i) => (
                        <tr key={p._id}>
                          <td>{i + 1}</td>
                          <td>
                            <Link href={playerHref(p)} className="scout-player-cell">
                              <Avatar src={p.photo_url} size={32} className="week-avatar" />
                              <div>
                                <div className="scout-player-name">{p.player_name}</div>
                                <div className="scout-player-club">
                                  {p.club_logo_url && <img src={p.club_logo_url} alt="" className="mini-inline-logo" />}
                                  {p["Current Club"] || "–"}
                                </div>
                              </div>
                            </Link>
                          </td>
                          <td>{p.age ?? "–"}</td>
                          {/* Přesná pozice z Transfermarktu, pod ní vedlejší pozice (když je známe) */}
                          <td>
                            {p.tm_position ? positionLabel(p.tm_position) : "–"}
                            {otherPositions(p).length > 0 && (
                              <div className="scout-player-club">
                                vedl.: {otherPositions(p).map(positionLabel).join(", ")}
                              </div>
                            )}
                          </td>
                          <td>{p.league_name || "–"}</td>
                          <td>{p.market_value || "–"}</td>
                          {statKeys.map((key) => (
                            <td key={key}>
                              {perStat[key] ? (
                                <>
                                  {formatStat(key, perStat[key].value)}
                                  <span className="scout-percentile"> (P{perStat[key].percentile})</span>
                                </>
                              ) : "–"}
                            </td>
                          ))}
                          <td>
                            <span className="scout-score-badge" style={{ background: scoreColor(score) }}>{score}%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-title">Žádný hráč neodpovídá kritériím</div>
                  <div className="empty-sub">Zkus uvolnit filtry (věk, ligu, tržní hodnotu) nebo zvolit méně metrik.</div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
