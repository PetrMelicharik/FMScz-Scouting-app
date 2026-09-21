"use client";
import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Avatar from "./Avatar";
import PersonIcon from "./PersonIcon";
import { flagUrl } from "../lib/countryFlags";

const FRESH_DAYS = 5;

/* ---------------------------------------------------------------------- */
/* Position → formation slot classification                                */
/* ---------------------------------------------------------------------- */

function classifyRaw(pos) {
  if (!pos) return null;
  const p = pos.toLowerCase();
  if (p.includes("goalkeeper")) return "GK";
  if (p.includes("right back") || p.includes("right-back") || p.includes("right wing back") || p.includes("right wing-back")) return "RB";
  if (p.includes("left back") || p.includes("left-back") || p.includes("left wing back") || p.includes("left wing-back")) return "LB";
  if (p.includes("centre back") || p.includes("center back") || p.includes("centre-back") || p.includes("center-back")) return "CB";
  if (p.includes("attacking midfield")) return "CAM";
  if (p.includes("defensive midfield") || p.includes("central midfield") || p.includes("centre midfield") || p.includes("center midfield")) return "CM";
  if (p.includes("left wing") || p.includes("left midfield")) return "LW";
  if (p.includes("right wing") || p.includes("right midfield")) return "RW";
  if (p.includes("second striker") || p.includes("centre forward") || p.includes("center forward") || p.includes("forward") || p.includes("striker") || p.includes("attack")) return "FW";
  if (p.includes("defender")) return "GENERIC_DF";
  if (p.includes("midfielder")) return "GENERIC_MF";
  return null;
}

const SLOT_LAYOUT = [
  { key: "GK", label: "Brankář", top: 93, left: 50 },
  { key: "LB", label: "Levý obránce", top: 76, left: 12 },
  { key: "CB1", label: "Střední obránce", top: 79, left: 37 },
  { key: "CB2", label: "Střední obránce", top: 79, left: 63 },
  { key: "RB", label: "Pravý obránce", top: 76, left: 88 },
  { key: "CM1", label: "Střední záložník", top: 57, left: 37 },
  { key: "CM2", label: "Střední záložník", top: 57, left: 63 },
  { key: "LW", label: "Levé křídlo", top: 40, left: 12 },
  { key: "CAM", label: "Ofenzivní záložník", top: 42, left: 50 },
  { key: "RW", label: "Pravé křídlo", top: 40, left: 88 },
  { key: "FW", label: "Útočník", top: 15, left: 50 },
];

function buildXI(players) {
  const pools = { GK: [], RB: [], LB: [], CB: [], CM: [], CAM: [], LW: [], RW: [], FW: [], GENERIC_DF: [], GENERIC_MF: [] };
  for (const p of players) {
    const slot = classifyRaw(p.tm_position || p.position);
    if (slot && pools[slot]) pools[slot].push(p);
  }
  Object.values(pools).forEach((arr) => arr.sort((a, b) => b.form_ratings[0] - a.form_ratings[0]));

  const used = new Set();
  function pick(...poolNames) {
    for (const name of poolNames) {
      const found = pools[name]?.find((p) => !used.has(p._id));
      if (found) { used.add(found._id); return found; }
    }
    return null;
  }

  return {
    GK: pick("GK"),
    LB: pick("LB", "GENERIC_DF"),
    CB1: pick("CB", "GENERIC_DF"),
    CB2: pick("CB", "GENERIC_DF"),
    RB: pick("RB", "GENERIC_DF"),
    CM1: pick("CM", "GENERIC_MF"),
    CM2: pick("CM", "GENERIC_MF"),
    LW: pick("LW", "GENERIC_MF"),
    CAM: pick("CAM", "GENERIC_MF"),
    RW: pick("RW", "GENERIC_MF"),
    FW: pick("FW"),
  };
}

/* ---------------------------------------------------------------------- */
/* Small helpers                                                           */
/* ---------------------------------------------------------------------- */

function formColor(r) {
  return r >= 7 ? "#4CB848" : r >= 6 ? "#D97706" : "#DC2626";
}

function formatShortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

function splitName(fullName) {
  const parts = (fullName || "").trim().split(" ");
  if (parts.length <= 1) return { first: fullName || "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/* ---------------------------------------------------------------------- */
/* Main view                                                                */
/* ---------------------------------------------------------------------- */

export default function TymTydneView() {
  const [dataset, setDataset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState("player");
  const [league, setLeague] = useState("");

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

  const rows = dataset ? dataset.rows : [];
  const leagues = useMemo(() => [...new Set(rows.map((r) => r.league_name).filter(Boolean))].sort(), [rows]);

  const eligible = useMemo(() => {
    const cutoff = Date.now() - FRESH_DAYS * 24 * 60 * 60 * 1000;
    return rows.filter((r) => {
      if (!r.form_last_date || !r.form_ratings || !r.form_ratings.length) return false;
      const t = new Date(r.form_last_date).getTime();
      if (Number.isNaN(t) || t < cutoff) return false;
      if (league && r.league_name !== league) return false;
      return true;
    });
  }, [rows, league]);

  return (
    <div>
      <div className="db-header">
        <h1 className="db-title">Tým týdne</h1>
        <p className="db-subtitle">
          {loading ? "Načítám databázi…" : dataset ? `Hráči s ratingem z posledních ${FRESH_DAYS} dní` : "Databázi se nepodařilo načíst."}
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 22 }}>
            <div className="chart-tabs">
              <button className={tab === "player" ? "chart-tab active" : "chart-tab"} onClick={() => setTab("player")}>Hráč týdne</button>
              <button className={tab === "team" ? "chart-tab active" : "chart-tab"} onClick={() => setTab("team")}>Tým týdne</button>
            </div>
            <div className="field" style={{ marginBottom: 0, minWidth: 220 }}>
              <select value={league} onChange={(e) => setLeague(e.target.value)}>
                <option value="">Všechny ligy</option>
                {leagues.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          {eligible.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">Žádní hráči s čerstvým ratingem</div>
              <div className="empty-sub">
                {league
                  ? `V lize "${league}" nemá nikdo rating z posledních ${FRESH_DAYS} dní.`
                  : `Nikdo v databázi nemá rating z posledních ${FRESH_DAYS} dní.`} Zkus jinou ligu nebo počkej na další běh workflow.
              </div>
            </div>
          ) : tab === "player" ? (
            <PlayerOfWeek players={eligible} />
          ) : (
            <TeamOfWeek players={eligible} />
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

/* ---------------------------------------------------------------------- */
/* Hráč týdne — ranked list                                                */
/* ---------------------------------------------------------------------- */

function PlayerOfWeek({ players }) {
  const sorted = useMemo(
    () => [...players].sort((a, b) => b.form_ratings[0] - a.form_ratings[0]).slice(0, 30),
    [players]
  );

  return (
    <div className="week-list">
      {sorted.map((p, i) => {
        const rating = p.form_ratings[0];
        return (
          <Link href={`/databaze/${p._id}`} className="week-row" key={p._id}>
            <div className="week-rank">{i + 1}</div>
            <Avatar src={p.photo_url} size={40} className="week-avatar" />
            <div className="week-info">
              <div className="week-name">{p.player_name}</div>
              <div className="week-sub">
                {p.club_logo_url && <img src={p.club_logo_url} alt="" className="mini-inline-logo" />}
                {p["Current Club"] || "–"} · {p.league_name || "–"}
              </div>
            </div>
            <div className="week-date">{formatShortDate(p.form_last_date)}</div>
            <div className="week-rating-badge" style={{ background: formColor(rating) }}>{rating.toFixed(1)}</div>
          </Link>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Tým týdne — pitch formation                                             */
/* ---------------------------------------------------------------------- */

function XISlotCard({ layout, player }) {
  if (!player) {
    return (
      <div className="xi-slot" style={{ top: `${layout.top}%`, left: `${layout.left}%` }}>
        <div className="xi-avatar-wrap">
          <div className="xi-avatar xi-avatar-empty"><PersonIcon size={22} /></div>
        </div>
        <div className="xi-slot-label">{layout.label}</div>
      </div>
    );
  }
  const rating = player.form_ratings[0];
  return (
    <Link href={`/databaze/${player._id}`} className="xi-slot" style={{ top: `${layout.top}%`, left: `${layout.left}%` }}>
      <div className="xi-avatar-wrap">
        <Avatar src={player.photo_url} size={60} className="xi-avatar" />
        {player.club_logo_url && <img src={player.club_logo_url} alt="" className="xi-club-badge" />}
      </div>
      <div className="xi-rating" style={{ background: formColor(rating) }}>{rating.toFixed(1)}</div>
      <div className="xi-name">
        <div className="xi-name-first">{splitName(player.player_name).first}</div>
        {splitName(player.player_name).last && (
          <div className="xi-name-last">{splitName(player.player_name).last}</div>
        )}
      </div>
    </Link>
  );
}

function TeamOfWeek({ players }) {
  const xi = useMemo(() => buildXI(players), [players]);
  const filledCount = SLOT_LAYOUT.filter((s) => xi[s.key]).length;

  return (
    <div>
      <div className="pitch">
        <div className="pitch-line pitch-halfway" />
        <div className="pitch-circle" />
        <div className="pitch-box" />
        {SLOT_LAYOUT.map((layout) => (
          <XISlotCard key={layout.key} layout={layout} player={xi[layout.key]} />
        ))}
      </div>
      <p className="chart-note" style={{ textAlign: "center" }}>
        {filledCount}/11 pozic obsazeno · rozestavba 1-4-5-1 (LW/RW/CAM jako ofenzivní záložníci)
      </p>
    </div>
  );
}
