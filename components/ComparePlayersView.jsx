"use client";
import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Avatar from "./Avatar";
import { flagUrl } from "../lib/countryFlags";
import { STAT_GROUPS, STAT_LABELS, formatStat } from "../lib/statMeta";
import {
  classifyPizzaGroup, computePizzaFromPool, MIN_MINUTES,
  CATEGORY_COLORS, CATEGORY_LABELS, PIZZA_GROUP_LABELS,
} from "../lib/pizzaShared";

const LOWER_IS_BETTER = new Set(["conceded_per_90", "dribbled_past_per_90"]);

/* ---------------------------------------------------------------------- */
/* Cascading league → club → player selector                              */
/* ---------------------------------------------------------------------- */

function PlayerSelector({ label, rows, leagues, value, onChange }) {
  const clubs = useMemo(() => {
    const source = value.league ? rows.filter((r) => r.league_name === value.league) : [];
    return [...new Set(source.map((r) => r["Current Club"]).filter(Boolean))].sort();
  }, [rows, value.league]);

  const players = useMemo(() => {
    const source = rows.filter((r) => r.league_name === value.league && r["Current Club"] === value.club);
    return [...source].sort((a, b) => a.player_name.localeCompare(b.player_name, "cs"));
  }, [rows, value.league, value.club]);

  return (
    <div className="compare-selector">
      <div className="compare-selector-label">{label}</div>
      <div className="field">
        <div className="field-label">Liga</div>
        <select
          value={value.league}
          onChange={(e) => onChange({ league: e.target.value, club: "", playerId: "" })}
        >
          <option value="">Vyber ligu</option>
          {leagues.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <div className="field">
        <div className="field-label">Klub</div>
        <select
          value={value.club}
          disabled={!value.league}
          onChange={(e) => onChange({ ...value, club: e.target.value, playerId: "" })}
        >
          <option value="">{value.league ? "Vyber klub" : "Nejdřív vyber ligu"}</option>
          {clubs.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="field">
        <div className="field-label">Hráč</div>
        <select
          value={value.playerId}
          disabled={!value.club}
          onChange={(e) => onChange({ ...value, playerId: e.target.value })}
        >
          <option value="">{value.club ? "Vyber hráče" : "Nejdřív vyber klub"}</option>
          {players.map((p) => <option key={p._id} value={p._id}>{p.player_name}</option>)}
        </select>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Mini profile header for each side                                       */
/* ---------------------------------------------------------------------- */

function PlayerSummaryCard({ p }) {
  return (
    <Link href={`/databaze/${p._id}`} className="compare-profile-card">
      <Avatar src={p.photo_url} size={72} className="compare-avatar" />
      <div className="compare-profile-name">{p.player_name}</div>
      <div className="compare-profile-meta">
        {flagUrl(p.nationality) && <img src={flagUrl(p.nationality)} alt="" className="mini-inline-logo" />}
        {p.nationality || "–"}
      </div>
      <div className="compare-profile-meta">{p.tm_position || p.position || "–"}</div>
      <div className="compare-profile-meta">
        {p.club_logo_url && <img src={p.club_logo_url} alt="" className="mini-inline-logo" />}
        {p["Current Club"] || "–"}
      </div>
      <div className="compare-profile-meta">
        {p.league_logo_url && <img src={p.league_logo_url} alt="" className="mini-inline-logo" />}
        {p.league_name || "–"}
      </div>
    </Link>
  );
}

/* ---------------------------------------------------------------------- */
/* Comparison pizza chart — one wedge per stat, split A | B                */
/* ---------------------------------------------------------------------- */

function wrapLabel(label, maxLen = 12) {
  const words = label.split(" ");
  const lines = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length > maxLen && current) {
      lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

function shortLabel(label) {
  return label.replace(/\/90$/, "");
}

function MiniBadge({ x, y, text, color }) {
  const w = Math.max(28, text.length * 6.6 + 10);
  const h = 17;
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill={color} />
      <text x={0} y={1} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="800" fill="#FFFFFF">
        {text}
      </text>
    </g>
  );
}

function ComparisonPizzaChart({ statsA, statsB, nameA, nameB, colorA, colorB }) {
  const n = statsA.length;
  const size = 700;
  const cx = size / 2;
  const cy = size / 2;
  const innerR = 64;
  const maxR = 228;
  const labelR = maxR + 46;
  const axisGapDeg = 18;
  const gapDeg = Math.min(3, (360 - axisGapDeg) / n / 5);
  const sliceDeg = (360 - axisGapDeg) / n;
  const sliceStart = axisGapDeg / 2;

  function polar(angleDeg, r) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }

  function wedgePath(a0, a1, r) {
    const [x0i, y0i] = polar(a0, innerR);
    const [x0o, y0o] = polar(a0, r);
    const [x1o, y1o] = polar(a1, r);
    const [x1i, y1i] = polar(a1, innerR);
    const largeArc = a1 - a0 > 180 ? 1 : 0;
    return `M ${x0i.toFixed(1)} ${y0i.toFixed(1)} L ${x0o.toFixed(1)} ${y0o.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 ${largeArc} 1 ${x1o.toFixed(1)} ${y1o.toFixed(1)} L ${x1i.toFixed(1)} ${y1i.toFixed(1)} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x0i.toFixed(1)} ${y0i.toFixed(1)} Z`;
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="pizza-svg">
      {[20, 40, 60, 80, 100].map((pct) => (
        <g key={pct}>
          <circle cx={cx} cy={cy} r={innerR + (pct / 100) * (maxR - innerR)} fill="none" stroke="#E3E8E2" strokeWidth="1" strokeDasharray="3 4" />
          <text x={cx} y={cy - (innerR + (pct / 100) * (maxR - innerR)) - 3} textAnchor="middle" fontSize="10" fill="#9AA39A">{pct}</text>
        </g>
      ))}
      {statsA.map((sA, i) => {
        const sB = statsB[i];
        const a0 = sliceStart + i * sliceDeg + gapDeg / 2;
        const a1 = sliceStart + (i + 1) * sliceDeg - gapDeg / 2;
        const aMid = (a0 + a1) / 2;
        const rA = innerR + (Math.max(2, sA.percentile) / 100) * (maxR - innerR);
        const rB = innerR + (Math.max(2, sB.percentile) / 100) * (maxR - innerR);
        const [badgeAx, badgeAy] = polar((a0 + aMid) / 2, Math.max(rA, innerR + 30));
        const [badgeBx, badgeBy] = polar((aMid + a1) / 2, Math.max(rB, innerR + 30));
        const [lx, ly] = polar(aMid, labelR);
        const flip = aMid > 90 && aMid < 270;
        const rot = flip ? aMid + 180 : aMid;
        const lines = wrapLabel(shortLabel(sA.label));

        return (
          <g key={sA.key}>
            <path d={wedgePath(a0, aMid, rA)} fill={colorA} fillOpacity="0.28" stroke={colorA} strokeWidth="1.5">
              <title>{`${nameA} — ${sA.label}: ${sA.display} (${sA.percentile}. percentil)`}</title>
            </path>
            <path d={wedgePath(aMid, a1, rB)} fill={colorB} fillOpacity="0.28" stroke={colorB} strokeWidth="1.5">
              <title>{`${nameB} — ${sB.label}: ${sB.display} (${sB.percentile}. percentil)`}</title>
            </path>
            <MiniBadge x={badgeAx} y={badgeAy} text={sA.display} color={colorA} />
            <MiniBadge x={badgeBx} y={badgeBy} text={sB.display} color={colorB} />
            <g transform={`translate(${lx.toFixed(1)} ${ly.toFixed(1)}) rotate(${rot.toFixed(1)})`}>
              {lines.map((line, li) => (
                <text key={li} x={0} y={(li - (lines.length - 1) / 2) * 12.5} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#44514A" style={{ pointerEvents: "none" }}>
                  {line}
                </text>
              ))}
            </g>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={innerR - 4} fill="#FFFFFF" stroke="#E3E8E2" strokeWidth="1.5" />
    </svg>
  );
}

/* ---------------------------------------------------------------------- */
/* Main view                                                                */
/* ---------------------------------------------------------------------- */

export default function ComparePlayersView() {
  const [dataset, setDataset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selA, setSelA] = useState({ league: "", club: "", playerId: "" });
  const [selB, setSelB] = useState({ league: "", club: "", playerId: "" });
  const [compared, setCompared] = useState(false);

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

  const rows = dataset ? dataset.rows : [];
  const leagues = useMemo(() => [...new Set(rows.map((r) => r.league_name).filter(Boolean))].sort(), [rows]);

  const playerA = selA.playerId ? rows.find((r) => String(r._id) === String(selA.playerId)) : null;
  const playerB = selB.playerId ? rows.find((r) => String(r._id) === String(selB.playerId)) : null;
  const canCompare = !!playerA && !!playerB;

  function buildPool(player) {
    const group = classifyPizzaGroup(player.tm_position || player.position);
    if (!group) return { group: null, pool: [] };
    const pool = rows.filter((r) => {
      if (r.league_name !== player.league_name) return false;
      if ((r.minutes_played ?? 0) < MIN_MINUTES) return false;
      return classifyPizzaGroup(r.tm_position || r.position) === group;
    });
    return { group, pool };
  }

  let pizzaResult = null;
  if (compared && canCompare) {
    const { group: groupA, pool: poolA } = buildPool(playerA);
    const { group: groupB, pool: poolB } = buildPool(playerB);
    const insufficientA = (playerA.minutes_played ?? 0) < MIN_MINUTES;
    const insufficientB = (playerB.minutes_played ?? 0) < MIN_MINUTES;
    const typeA = groupA === "GK" ? "GK" : groupA ? "OUTFIELD" : null;
    const typeB = groupB === "GK" ? "GK" : groupB ? "OUTFIELD" : null;

    if (insufficientA || insufficientB) {
      pizzaResult = { error: "minutes", insufficientA, insufficientB };
    } else if (!typeA || !typeB) {
      pizzaResult = { error: "position" };
    } else if (typeA !== typeB) {
      pizzaResult = { error: "mismatch" };
    } else {
      const dataA = computePizzaFromPool(playerA, poolA, groupA);
      const dataB = computePizzaFromPool(playerB, poolB, groupB);
      if (!dataA || !dataB) {
        pizzaResult = { error: "insufficient_data" };
      } else {
        const keysB = new Set(dataB.stats.map((s) => s.key));
        const statsA = dataA.stats.filter((s) => keysB.has(s.key));
        const keysA = new Set(statsA.map((s) => s.key));
        const statsB = dataB.stats.filter((s) => keysA.has(s.key));
        if (statsA.length < 4) {
          pizzaResult = { error: "insufficient_data" };
        } else {
          pizzaResult = { statsA, statsB, groupA, groupB, dataA, dataB };
        }
      }
    }
  }

  const isGoalkeeperA = playerA ? classifyPizzaGroup(playerA.tm_position || playerA.position) === "GK" : false;
  const isGoalkeeperB = playerB ? classifyPizzaGroup(playerB.tm_position || playerB.position) === "GK" : false;

  return (
    <div>
      <div className="db-header">
        <h1 className="db-title">Porovnání hráčů</h1>
        <p className="db-subtitle">
          {loading ? "Načítám databázi…" : dataset ? "Vyber dva hráče a porovnej jejich profily i statistiky" : "Databázi se nepodařilo načíst."}
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
          <div className="compare-selectors">
            <PlayerSelector label="Hráč A" rows={rows} leagues={leagues} value={selA} onChange={(v) => { setSelA(v); setCompared(false); }} />
            <PlayerSelector label="Hráč B" rows={rows} leagues={leagues} value={selB} onChange={(v) => { setSelB(v); setCompared(false); }} />
          </div>

          <div className="compare-button-row">
            <button className="btn-accent" disabled={!canCompare} onClick={() => setCompared(true)}>
              Porovnat hráče
            </button>
          </div>

          {compared && canCompare && (
            <>
              <div className="compare-profiles-row">
                <PlayerSummaryCard p={playerA} />
                <PlayerSummaryCard p={playerB} />
              </div>

              <div className="profile-group">
                <div className="profile-group-title">Srovnání v pizza grafu</div>
                {pizzaResult?.error === "minutes" && (
                  <div className="empty-state">
                    <div className="empty-title">Graf zatím není dostupný</div>
                    <div className="empty-sub">
                      {pizzaResult.insufficientA && pizzaResult.insufficientB
                        ? "Oba hráči mají odehráno méně než 300 minut."
                        : pizzaResult.insufficientA
                        ? `${playerA.player_name} má odehráno méně než 300 minut.`
                        : `${playerB.player_name} má odehráno méně než 300 minut.`}
                    </div>
                  </div>
                )}
                {pizzaResult?.error === "position" && (
                  <div className="empty-state">
                    <div className="empty-title">Graf zatím není dostupný</div>
                    <div className="empty-sub">U jednoho z hráčů se nepodařilo rozpoznat pozici.</div>
                  </div>
                )}
                {pizzaResult?.error === "mismatch" && (
                  <div className="empty-state">
                    <div className="empty-title">Hráče nelze porovnat v jednom grafu</div>
                    <div className="empty-sub">Jeden hráč je brankář a druhý hráč do pole — mají úplně jiné statistiky, srovnání v jednom kole grafu proto nedává smysl.</div>
                  </div>
                )}
                {pizzaResult?.error === "insufficient_data" && (
                  <div className="empty-state">
                    <div className="empty-title">Nedostatek společných dat</div>
                    <div className="empty-sub">Pro tuhle dvojici hráčů není dost společných statistik na srovnání.</div>
                  </div>
                )}
                {pizzaResult && !pizzaResult.error && (
                  <>
                    <div className="pizza-panel">
                      <ComparisonPizzaChart
                        statsA={pizzaResult.statsA} statsB={pizzaResult.statsB}
                        nameA={playerA.player_name} nameB={playerB.player_name}
                        colorA="#2563EB" colorB="#DC2626"
                      />
                    </div>
                    <div className="pizza-legend">
                      <div className="pizza-legend-item"><span className="legend-dot" style={{ background: "#2563EB" }}></span>{playerA.player_name}</div>
                      <div className="pizza-legend-item"><span className="legend-dot" style={{ background: "#DC2626" }}></span>{playerB.player_name}</div>
                    </div>
                    <p className="chart-note" style={{ textAlign: "center" }}>
                      Každý hráč je srovnán se skupinou hráčů své vlastní pozice ({PIZZA_GROUP_LABELS[pizzaResult.groupA]}
                      {pizzaResult.groupA !== pizzaResult.groupB ? ` / ${PIZZA_GROUP_LABELS[pizzaResult.groupB]}` : ""}) ve své vlastní lize, min. 300 odehraných minut.
                    </p>
                  </>
                )}
              </div>

              {Object.entries(STAT_GROUPS)
                .filter(([group]) => group !== "Obecné")
                .filter(([group]) => {
                  const wantsGK = isGoalkeeperA || isGoalkeeperB;
                  return wantsGK ? group === "Brankářské" : group !== "Brankářské";
                })
                .map(([group, keys]) => {
                  const visible = keys.filter((k) => (playerA[k] !== null && playerA[k] !== undefined && playerA[k] !== "") || (playerB[k] !== null && playerB[k] !== undefined && playerB[k] !== ""));
                  if (!visible.length) return null;
                  return (
                    <div key={group} className="profile-group">
                      <div className="profile-group-title">{group}</div>
                      <div className="compare-bar-legend">
                        <div className="pizza-legend-item"><span className="legend-dot" style={{ background: "#2563EB" }}></span>{playerA.player_name}</div>
                        <div className="pizza-legend-item"><span className="legend-dot" style={{ background: "#DC2626" }}></span>{playerB.player_name}</div>
                      </div>
                      <div className="compare-bar-table">
                        {visible.map((k) => {
                          const va = playerA[k];
                          const vb = playerB[k];
                          const na = va === null || va === undefined || va === "" ? null : Number(va);
                          const nb = vb === null || vb === undefined || vb === "" ? null : Number(vb);
                          const magA = na === null || Number.isNaN(na) ? 0 : Math.abs(na);
                          const magB = nb === null || Number.isNaN(nb) ? 0 : Math.abs(nb);
                          const total = magA + magB;
                          const pctA = total > 0 ? (magA / total) * 100 : 50;
                          const pctB = 100 - pctA;
                          let winner = null;
                          if (na !== null && nb !== null && !Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) {
                            const lower = LOWER_IS_BETTER.has(k);
                            winner = (na > nb) !== lower ? "a" : "b";
                          }
                          return (
                            <div key={k} className="compare-bar-row">
                              <div className="compare-bar-label">{STAT_LABELS[k] || k}</div>
                              <div className="compare-bar-track">
                                <div
                                  className={winner === "a" ? "compare-bar-segment compare-bar-segment-win" : "compare-bar-segment"}
                                  style={{ width: `${pctA}%`, background: "#2563EB" }}
                                >
                                  <span className="compare-bar-value">{na !== null ? formatStat(k, va) : "–"}</span>
                                </div>
                                <div
                                  className={winner === "b" ? "compare-bar-segment compare-bar-segment-win" : "compare-bar-segment"}
                                  style={{ width: `${pctB}%`, background: "#DC2626" }}
                                >
                                  <span className="compare-bar-value">{nb !== null ? formatStat(k, vb) : "–"}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </>
          )}
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
