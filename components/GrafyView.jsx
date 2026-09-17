"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import { STAT_GROUPS, STAT_LABELS, formatStat } from "../lib/statMeta";

const AXIS_OPTIONS = [
  ["age", "Věk"],
  ...Object.entries(STAT_GROUPS).flatMap(([g, keys]) => keys.map((k) => [k, `${STAT_LABELS[k] || k} (${g})`])),
];

const POSITION_COLORS = { GK: "#D97706", DF: "#2563EB", MF: "#4CB848", FW: "#DC2626", other: "#9AA39A" };
const POSITION_LABELS = { GK: "Brankář", DF: "Obránce", MF: "Záložník", FW: "Útočník", other: "Ostatní" };

function positionBucket(pos) {
  if (!pos) return "other";
  const p = pos.toLowerCase();
  if (p.includes("keeper")) return "GK";
  if (p.includes("back") || p.includes("defen")) return "DF";
  if (p.includes("midfield")) return "MF";
  if (p.includes("wing") || p.includes("forward") || p.includes("striker") || p.includes("attack")) return "FW";
  return "other";
}

function ScatterTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-name">{p.player_name}</div>
      <div className="chart-tooltip-sub">{p["Current Club"] || "–"} · {p.tm_position || p.position || "–"}</div>
      <div>{p.xLabel}: <strong>{p.xDisplay}</strong></div>
      <div>{p.yLabel}: <strong>{p.yDisplay}</strong></div>
    </div>
  );
}

function BarTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-name">{p.player_name}</div>
      <div className="chart-tooltip-sub">{p["Current Club"] || "–"} · {p.league_name || "–"}</div>
      <div>{p.statLabel}: <strong>{p.display}</strong></div>
    </div>
  );
}

export default function GrafyView() {
  const router = useRouter();
  const [dataset, setDataset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState("scatter");

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

  return (
    <div>
      <div className="db-header">
        <h1 className="db-title">Grafy</h1>
        <p className="db-subtitle">
          {loading ? "Načítám databázi…" : dataset ? "Vizuální analýza dat z databáze hráčů" : "Databázi se nepodařilo načíst."}
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
          <div className="chart-tabs">
            <button className={tab === "scatter" ? "chart-tab active" : "chart-tab"} onClick={() => setTab("scatter")}>Bodový graf</button>
            <button className={tab === "top" ? "chart-tab active" : "chart-tab"} onClick={() => setTab("top")}>Žebříček</button>
          </div>

          {tab === "scatter" && <ScatterPanel rows={rows} leagues={leagues} router={router} />}
          {tab === "top" && <TopPanel rows={rows} leagues={leagues} router={router} />}
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

function ScatterPanel({ rows, leagues, router }) {
  const [league, setLeague] = useState("");
  const [minMinutes, setMinMinutes] = useState("450");
  const [xStat, setXStat] = useState("age");
  const [yStat, setYStat] = useState("avg_rating_");
  const [chart, setChart] = useState(null);

  function generate() {
    const xLabel = AXIS_OPTIONS.find(([k]) => k === xStat)?.[1] || xStat;
    const yLabel = AXIS_OPTIONS.find(([k]) => k === yStat)?.[1] || yStat;

    const points = rows
      .filter((r) => !league || r.league_name === league)
      .filter((r) => (r.minutes_played ?? 0) >= Number(minMinutes || 0))
      .filter((r) => r[xStat] !== null && r[xStat] !== undefined && r[yStat] !== null && r[yStat] !== undefined)
      .map((r) => ({
        ...r,
        x: Number(r[xStat]),
        y: Number(r[yStat]),
        xLabel, yLabel,
        xDisplay: formatStat(xStat, r[xStat]),
        yDisplay: formatStat(yStat, r[yStat]),
        bucket: positionBucket(r.tm_position || r.position),
      }))
      .filter((r) => !Number.isNaN(r.x) && !Number.isNaN(r.y));

    setChart({ points, xLabel, yLabel });
  }

  return (
    <div>
      <div className="filter-panel">
        <div className="filter-grid">
          <div className="field">
            <div className="field-label">Liga</div>
            <select value={league} onChange={(e) => setLeague(e.target.value)}>
              <option value="">Všechny ligy</option>
              {leagues.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <div className="field-label">Min. odehraných minut</div>
            <input type="number" value={minMinutes} onChange={(e) => setMinMinutes(e.target.value)} />
          </div>
          <div className="field">
            <div className="field-label">Osa X</div>
            <select value={xStat} onChange={(e) => setXStat(e.target.value)}>
              {AXIS_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <div className="field-label">Osa Y</div>
            <select value={yStat} onChange={(e) => setYStat(e.target.value)}>
              {AXIS_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        </div>
        <button className="btn-accent" onClick={generate}>Generovat</button>
      </div>

      {!chart ? (
        <div className="empty-state">
          <div className="empty-title">Zatím žádný graf</div>
          <div className="empty-sub">Nastav filtry a osy a klikni na Generovat.</div>
        </div>
      ) : chart.points.length === 0 ? (
        <div className="empty-state">
          <div className="empty-title">Žádní hráči neodpovídají filtru</div>
          <div className="empty-sub">Zkus snížit min. minuty nebo zvolit jinou ligu.</div>
        </div>
      ) : (
        <>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={480}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid stroke="#E3E8E2" />
                <XAxis type="number" dataKey="x" name={chart.xLabel} tick={{ fontSize: 12, fill: "#667066" }} label={{ value: chart.xLabel, position: "insideBottom", offset: -10, fontSize: 12, fill: "#667066" }} />
                <YAxis type="number" dataKey="y" name={chart.yLabel} tick={{ fontSize: 12, fill: "#667066" }} label={{ value: chart.yLabel, angle: -90, position: "insideLeft", fontSize: 12, fill: "#667066" }} />
                <ZAxis range={[50, 51]} />
                <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={chart.points} onClick={(d) => router.push(`/databaze/${d._id}`)} cursor="pointer">
                  {chart.points.map((p) => (
                    <Cell key={p._id} fill={POSITION_COLORS[p.bucket]} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-legend">
            {Object.entries(POSITION_LABELS).map(([k, label]) => (
              <div key={k} className="chart-legend-item">
                <span className="legend-dot" style={{ background: POSITION_COLORS[k] }}></span>
                {label}
              </div>
            ))}
          </div>
          <p className="chart-note">{chart.points.length.toLocaleString("cs-CZ")} hráčů v grafu. Klikni na bod pro otevření profilu hráče.</p>
        </>
      )}
    </div>
  );
}

function TopPanel({ rows, leagues, router }) {
  const [league, setLeague] = useState("");
  const [minMinutes, setMinMinutes] = useState("450");
  const [stat, setStat] = useState("goals_per_90");
  const [count, setCount] = useState("10");
  const [dir, setDir] = useState("desc");
  const [chart, setChart] = useState(null);

  function generate() {
    const statLabel = AXIS_OPTIONS.find(([k]) => k === stat)?.[1] || stat;
    let list = rows
      .filter((r) => !league || r.league_name === league)
      .filter((r) => (r.minutes_played ?? 0) >= Number(minMinutes || 0))
      .filter((r) => r[stat] !== null && r[stat] !== undefined && !Number.isNaN(Number(r[stat])));

    list = [...list].sort((a, b) => dir === "desc" ? b[stat] - a[stat] : a[stat] - b[stat]);
    list = list.slice(0, Number(count)).map((r) => ({
      ...r,
      value: Number(r[stat]),
      display: formatStat(stat, r[stat]),
      statLabel,
      label: `${r.player_name} (${r.season})`,
    }));

    setChart({ list, statLabel });
  }

  const rowHeight = 34;

  return (
    <div>
      <div className="filter-panel">
        <div className="filter-grid">
          <div className="field">
            <div className="field-label">Liga</div>
            <select value={league} onChange={(e) => setLeague(e.target.value)}>
              <option value="">Všechny ligy</option>
              {leagues.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <div className="field-label">Statistika</div>
            <select value={stat} onChange={(e) => setStat(e.target.value)}>
              {AXIS_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <div className="field-label">Min. odehraných minut</div>
            <input type="number" value={minMinutes} onChange={(e) => setMinMinutes(e.target.value)} />
          </div>
          <div className="field">
            <div className="field-label">Počet hráčů</div>
            <select value={count} onChange={(e) => setCount(e.target.value)}>
              <option value="10">Top 10</option>
              <option value="20">Top 20</option>
              <option value="50">Top 50</option>
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button className={dir === "desc" ? "btn chart-dir-active" : "btn"} onClick={() => setDir("desc")}>↓ Nejvyšší první</button>
          <button className={dir === "asc" ? "btn chart-dir-active" : "btn"} onClick={() => setDir("asc")}>↑ Nejnižší první</button>
        </div>
        <button className="btn-accent" onClick={generate}>Generovat</button>
      </div>

      {!chart ? (
        <div className="empty-state">
          <div className="empty-title">Zatím žádný graf</div>
          <div className="empty-sub">Nastav filtry a statistiku a klikni na Generovat.</div>
        </div>
      ) : chart.list.length === 0 ? (
        <div className="empty-state">
          <div className="empty-title">Žádní hráči neodpovídají filtru</div>
          <div className="empty-sub">Zkus snížit min. minuty nebo zvolit jinou ligu.</div>
        </div>
      ) : (
        <div className="chart-box">
          <ResponsiveContainer width="100%" height={Math.max(220, chart.list.length * rowHeight + 40)}>
            <BarChart data={chart.list} layout="vertical" margin={{ top: 10, right: 30, bottom: 10, left: 10 }}>
              <CartesianGrid stroke="#E3E8E2" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: "#667066" }} />
              <YAxis type="category" dataKey="label" width={190} tick={{ fontSize: 12.5, fill: "#14171A" }} interval={0} />
              <Tooltip content={<BarTooltip />} cursor={{ fill: "rgba(76,184,72,0.08)" }} />
              <Bar dataKey="value" fill="#4CB848" radius={[0, 6, 6, 0]} onClick={(d) => router.push(`/databaze/${d._id}`)} cursor="pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
