"use client";
// Radar příležitostí – stránka /radar. Výpočet je v lib/radar.js, tady je
// jen načtení dat, filtry, záložky podle pozic a tabulka výsledků.
import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { playerHref } from "../lib/playerUrl";
import Avatar from "./Avatar";
import { PIZZA_GROUP_LABELS } from "../lib/pizzaShared";
import { positionLabel } from "../lib/positions";
import {
  RADAR_GROUPS, computeRadar, contractDeadlineOptions, defaultContractDeadline, formatContractDate,
} from "../lib/radar";

const TOP_N_OPTIONS = [10, 20, 30];
const DEFAULT_MAX_VALUE_M = "1"; // výchozí max. tržní hodnota v mil. €

// Barva skóre – stejná jako u "Shody" ve Scouting toolu
function scoreColor(score) {
  return score >= 80 ? "#4CB848" : score >= 60 ? "#D97706" : "#DC2626";
}

export default function RadarView() {
  // --- Načtení databáze hráčů (stejně jako Scouting tool) ---
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/data/players.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        if (cancelled) return;
        const cols = payload.columns;
        setRows(payload.rows.map((r, i) => {
          const o = { _id: i };
          cols.forEach((c, ci) => { o[c] = r[ci]; });
          return o;
        }));
      } catch (e) {
        if (!cancelled) setLoadError(e.message || "neznámá chyba");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const leagues = useMemo(() => (rows ? [...new Set(rows.map((r) => r.league_name).filter(Boolean))].sort() : []), [rows]);

  // --- Filtry (výchozí: smlouva do 30. 6. příštího roku, hodnota do 1 mil. €, top 10) ---
  // (30. 6. příštího roku je v nabídce vždy – nabídka pokrývá 4 nejbližší termíny)
  const contractOptions = useMemo(() => contractDeadlineOptions(), []);
  const [tab, setTab] = useState("CB");
  const [contractBy, setContractBy] = useState(defaultContractDeadline());
  const [maxValueM, setMaxValueM] = useState(DEFAULT_MAX_VALUE_M);
  const [league, setLeague] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [topN, setTopN] = useState(10);

  // Nastavení se pamatuje v adrese stránky – po návratu z profilu hráče
  // (tlačítko Zpět) se ukáže stejný výběr.
  const restoredRef = useRef(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.has("tab")) setTab(p.get("tab"));
    if (p.has("contract")) setContractBy(p.get("contract"));
    if (p.has("maxv")) setMaxValueM(p.get("maxv"));
    if (p.has("league")) setLeague(p.get("league"));
    if (p.has("ageMin")) setAgeMin(p.get("ageMin"));
    if (p.has("ageMax")) setAgeMax(p.get("ageMax"));
    if (p.has("topN")) setTopN(Number(p.get("topN")) || 10);
    restoredRef.current = true;
  }, []);
  useEffect(() => {
    if (!restoredRef.current) return;
    const p = new URLSearchParams();
    if (tab !== "CB") p.set("tab", tab);
    if (contractBy !== defaultContractDeadline()) p.set("contract", contractBy);
    if (maxValueM !== DEFAULT_MAX_VALUE_M) p.set("maxv", maxValueM);
    if (league) p.set("league", league);
    if (ageMin !== "") p.set("ageMin", ageMin);
    if (ageMax !== "") p.set("ageMax", ageMax);
    if (topN !== 10) p.set("topN", String(topN));
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, [tab, contractBy, maxValueM, league, ageMin, ageMax, topN]);

  // --- Výpočet radaru (přepočítá se při změně filtrů) ---
  const radar = useMemo(() => {
    if (!rows) return null;
    return computeRadar(rows, {
      contractBy,
      maxValue: maxValueM !== "" ? Number(maxValueM) * 1_000_000 : null,
      league,
      ageMin: ageMin !== "" ? Number(ageMin) : null,
      ageMax: ageMax !== "" ? Number(ageMax) : null,
      topN,
    });
  }, [rows, contractBy, maxValueM, league, ageMin, ageMax, topN]);

  const current = radar ? radar[tab] : null;

  return (
    <div>
      <div className="db-header">
        <h1 className="db-title">Radar příležitostí</h1>
        <p className="db-subtitle">
          Hráči, kterým brzy končí smlouva, mají nízkou tržní hodnotu a přitom ve své lize patří k nejlepším na své pozici.
        </p>
      </div>

      {loadError && (
        <div className="empty-state" style={{ marginBottom: 24 }}>
          <div className="empty-title">Data se nepodařilo načíst</div>
          <div className="empty-sub">Chyba: {loadError}</div>
        </div>
      )}

      {!rows && !loadError && (
        <div className="empty-state">
          <div className="empty-title">Načítám databázi…</div>
        </div>
      )}

      {radar && (
        <>
          {/* Filtry */}
          <div className="filter-panel">
            <div className="filter-grid">
              <div className="field">
                <div className="field-label">Smlouva končí</div>
                <select value={contractBy} onChange={(e) => setContractBy(e.target.value)}>
                  {contractOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  {!contractOptions.some(([v]) => v === contractBy) && <option value={contractBy}>Do {contractBy}</option>}
                </select>
              </div>
              <div className="field">
                <div className="field-label">Max. tržní hodnota (mil. €)</div>
                <input type="number" step="0.1" min="0" value={maxValueM} onChange={(e) => setMaxValueM(e.target.value)} placeholder="bez omezení" />
              </div>
              <div className="field">
                <div className="field-label">Liga</div>
                <select value={league} onChange={(e) => setLeague(e.target.value)}>
                  <option value="">Všechny ligy</option>
                  {leagues.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="field">
                <div className="field-label">Věk od</div>
                <input type="number" min="0" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} placeholder="bez omezení" />
              </div>
              <div className="field">
                <div className="field-label">Věk do</div>
                <input type="number" min="0" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} placeholder="bez omezení" />
              </div>
            </div>

            {/* Záložky podle skupin pozic, u každé počet nalezených hráčů */}
            <div className="field" style={{ marginBottom: 0 }}>
              <div className="field-label">Pozice</div>
              <div className="chip-row" style={{ maxHeight: "none" }}>
                {RADAR_GROUPS.map((g) => (
                  <button key={g} type="button" className={tab === g ? "chip active" : "chip"} onClick={() => setTab(g)}>
                    {PIZZA_GROUP_LABELS[g]} ({radar[g].total})
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div className="field-label" style={{ marginBottom: 0 }}>
              {current.total > 0
                ? `Nejlepších ${current.items.length} z ${current.total} hráčů – ${PIZZA_GROUP_LABELS[tab]}`
                : "Žádný hráč neodpovídá kritériím"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="field-label" style={{ marginBottom: 0 }}>Počet výsledků</span>
              <select value={topN} onChange={(e) => setTopN(Number(e.target.value))} style={{ width: "auto" }}>
                {TOP_N_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {current.items.length > 0 ? (
            <div className="scout-table-wrap">
              <table className="scout-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Hráč</th>
                    <th>Liga</th>
                    <th>Věk</th>
                    <th>Pozice</th>
                    <th>Smlouva do</th>
                    <th>Tržní hodnota</th>
                    <th>Skóre</th>
                    <th>Silné stránky</th>
                  </tr>
                </thead>
                <tbody>
                  {current.items.map(({ player: p, score, strengths }, i) => (
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
                      <td>{p.league_name || "–"}</td>
                      <td>{p.age ?? "–"}</td>
                      <td>{p.tm_position ? positionLabel(p.tm_position) : "–"}</td>
                      <td>{formatContractDate(p.contract_until)}</td>
                      <td>{p.market_value || "–"}</td>
                      <td>
                        <span className="scout-score-badge" style={{ background: scoreColor(score) }}>{score}</span>
                      </td>
                      <td>
                        {strengths.map((s, si) => (
                          <span key={s.key}>
                            {si > 0 && ", "}
                            {s.label}<span className="scout-percentile"> (P{s.percentile})</span>
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-title">Žádný hráč neodpovídá kritériím</div>
              <div className="empty-sub">Zkus uvolnit filtry (smlouvu, tržní hodnotu, věk nebo ligu).</div>
            </div>
          )}

          <p className="chart-note">
            Skóre = průměrný percentil ze statistik pizza grafu (0–100), ve srovnání s hráči stejné skupiny pozic
            ve stejné lize, kteří odehráli aspoň 40 % minut odehratelných v lize (nejméně 300). Skóre se proto
            dá porovnávat jen v rámci ligy. Statistiky, které liga nesleduje (aspoň 90 % hráčů má 0), se nepočítají;
            hráč musí mít aspoň 12 statistik se skutečnými daty (brankář 5). Hráči bez známé smlouvy nebo tržní hodnoty se v radaru nezobrazují.
            Silné stránky = 3 statistiky s nejvyšším percentilem.
          </p>
        </>
      )}
    </div>
  );
}
