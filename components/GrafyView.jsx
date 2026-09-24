"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, LabelList,
} from "recharts";
import { STAT_GROUPS, STAT_LABELS, formatStat } from "../lib/statMeta";

// Each entry: [key, dropdown label (with group), plain label (for chart/axis/title)]
const AXIS_OPTIONS = [
  ["age", "Věk", "Věk"],
  ...Object.entries(STAT_GROUPS).flatMap(([g, keys]) =>
    keys.map((k) => [k, `${STAT_LABELS[k] || k} (${g})`, STAT_LABELS[k] || k])
  ),
];

const GK_STAT_KEYS = new Set(STAT_GROUPS["Brankářské"]);

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

function axisLabel(key) {
  return AXIS_OPTIONS.find(([k]) => k === key)?.[2] || key;
}

function ScatterDot(props) {
  const { cx, cy, fill, payload } = props;
  if (cx === undefined || cy === undefined) return null;
  const left = payload?.labelSide === "left";
  const tier = payload?.labelTier || 0;
  const labelY = cy + 4 - tier * 13;
  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill={fill} fillOpacity={0.78} stroke="#FFFFFF" strokeWidth={1.5} />
      {payload?.labeled && (
        <>
          {tier > 0 && (
            <line x1={cx} y1={cy} x2={left ? cx - 10 : cx + 10} y2={labelY} stroke="#9AA39A" strokeWidth={1} />
          )}
          <text
            x={left ? cx - 10 : cx + 10} y={labelY}
            textAnchor={left ? "end" : "start"}
            fontSize={11} fontWeight={600} fill="#14171A" style={{ pointerEvents: "none" }}
          >
            {payload.player_name}
          </text>
        </>
      )}
    </g>
  );
}

function computeDomain(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const clampLower = (lower) => (min >= 0 ? Math.max(0, lower) : lower);
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.1, 1);
    return [clampLower(min - pad), max + pad];
  }
  const pad = (max - min) * 0.08;
  return [clampLower(min - pad), max + pad];
}

function formatAxisTick(value, span) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  let decimals = 0;
  if (span < 3) decimals = 2;
  else if (span < 30) decimals = 1;
  return n.toFixed(decimals);
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

function sanitizeFilename(s) {
  return String(s).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function downloadChartAsImage(containerEl, filename, title, subtitle) {
  if (!containerEl) return;
  const svgEl = containerEl.querySelector("svg");
  if (!svgEl) return;

  const rect = svgEl.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  const header = title ? 58 : 0;
  const footer = 40;

  const clonedSvg = svgEl.cloneNode(true);
  clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clonedSvg.setAttribute("width", width);
  clonedSvg.setAttribute("height", height);
  const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bgRect.setAttribute("width", "100%");
  bgRect.setAttribute("height", "100%");
  bgRect.setAttribute("fill", "#FFFFFF");
  clonedSvg.insertBefore(bgRect, clonedSvg.firstChild);

  const svgString = new XMLSerializer().serializeToString(clonedSvg);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const [chartImg, logoImg] = await Promise.all([
      loadImage(svgUrl),
      loadImage("/logo.jpg").catch(() => null),
    ]);

    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = (header + height + footer) * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, header + height + footer);

    if (title) {
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#14171A";
      ctx.font = "700 17px Arial, sans-serif";
      ctx.fillText(title, 18, 28);
      if (subtitle) {
        ctx.fillStyle = "#667066";
        ctx.font = "400 13px Arial, sans-serif";
        ctx.fillText(subtitle, 18, 47);
      }
      ctx.strokeStyle = "#E3E8E2";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, header - 0.5);
      ctx.lineTo(width, header - 0.5);
      ctx.stroke();
    }

    ctx.drawImage(chartImg, 0, header, width, height);

    ctx.strokeStyle = "#E3E8E2";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, header + height + 0.5);
    ctx.lineTo(width, header + height + 0.5);
    ctx.stroke();

    const logoSize = 24;
    const logoY = header + height + (footer - logoSize) / 2;
    let textX = 14;
    if (logoImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(14 + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logoImg, 14, logoY, logoSize, logoSize);
      ctx.restore();
      textX = 14 + logoSize + 8;
    }

    ctx.font = "700 14px Arial, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#4CB848";
    ctx.fillText("FM", textX, header + height + footer / 2);
    const fmWidth = ctx.measureText("FM ").width;
    ctx.fillStyle = "#14171A";
    ctx.fillText("Scouts", textX + fmWidth, header + height + footer / 2);
    const scoutsWidth = ctx.measureText("Scouts ").width;
    ctx.fillStyle = "#667066";
    ctx.fillText("cz", textX + fmWidth + scoutsWidth, header + height + footer / 2);

    canvas.toBlob((blob) => {
      const link = document.createElement("a");
      link.download = filename;
      link.href = URL.createObjectURL(blob);
      link.click();
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function DownloadButton({ targetRef, filename, title, subtitle }) {
  return (
    <button className="btn chart-download-btn" onClick={() => downloadChartAsImage(targetRef.current, filename, title, subtitle)}>
      ⬇ Stáhnout graf
    </button>
  );
}

function Watermark() {
  return (
    <div className="chart-watermark">
      <img src="/logo.jpg" alt="" className="chart-watermark-logo" />
      FM <span className="accent">Scouts</span> cz
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
          o.bucket = positionBucket(o.tm_position || o.position);
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
  const chartRef = useRef(null);

  function generate() {
    const xLabel = axisLabel(xStat);
    const yLabel = axisLabel(yStat);
    const gkChart = GK_STAT_KEYS.has(xStat) || GK_STAT_KEYS.has(yStat);

    let points = rows
      .filter((r) => !league || r.league_name === league)
      .filter((r) => (r.minutes_played ?? 0) >= Number(minMinutes || 0))
      .filter((r) => (gkChart ? r.bucket === "GK" : r.bucket !== "GK"))
      .filter((r) => r[xStat] !== null && r[xStat] !== undefined && r[yStat] !== null && r[yStat] !== undefined)
      .map((r) => ({
        ...r,
        x: Number(r[xStat]),
        y: Number(r[yStat]),
        xLabel, yLabel,
        xDisplay: formatStat(xStat, r[xStat]),
        yDisplay: formatStat(yStat, r[yStat]),
      }))
      .filter((r) => !Number.isNaN(r.x) && !Number.isNaN(r.y));

    const topIds = new Set([...points].sort((a, b) => b.y - a.y).slice(0, 10).map((p) => p._id));
    const xDomain = points.length ? computeDomain(points.map((p) => p.x)) : [0, 1];
    const yDomain = points.length ? computeDomain(points.map((p) => p.y)) : [0, 1];
    const xSpan = xDomain[1] - xDomain[0];

    // Labeled points that sit close together on X (a common case when many
    // players share a similar stat value) would otherwise have their name
    // labels drawn right on top of each other — stagger them into
    // alternating vertical tiers instead.
    const closeThreshold = xSpan * 0.06;
    const tierByld = new Map();
    const sortedLabeled = points.filter((p) => topIds.has(p._id)).sort((a, b) => a.x - b.x);
    let lastX = null;
    let tier = 0;
    for (const p of sortedLabeled) {
      tier = lastX !== null && p.x - lastX < closeThreshold ? (tier + 1) % 4 : 0;
      tierByld.set(p._id, tier);
      lastX = p.x;
    }

    points = points.map((p) => ({
      ...p,
      labeled: topIds.has(p._id),
      labelTier: tierByld.get(p._id) || 0,
      labelSide: (p.x - xDomain[0]) / xSpan > 0.82 ? "left" : "right",
    }));

    setChart({ points, xLabel, yLabel, gkChart, xDomain, yDomain });
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
          <div className="chart-toolbar">
            <span className="chart-toolbar-title">{chart.yLabel} vs. {chart.xLabel}</span>
            <DownloadButton
              targetRef={chartRef}
              filename={`fmscouts-${sanitizeFilename(chart.xLabel)}-${sanitizeFilename(chart.yLabel)}.png`}
              title={`${chart.yLabel} vs. ${chart.xLabel}`}
              subtitle={`${league || "Všechny ligy"} · min. ${minMinutes || 0} minut`}
            />
          </div>
          {chart.gkChart && <p className="chart-note" style={{ marginTop: 0, marginBottom: 10 }}>Zobrazeni jsou jen brankáři — zvolená statistika je brankářská.</p>}
          <div className="chart-box" ref={chartRef}>
            <Watermark />
            <ResponsiveContainer width="100%" height={480}>
              <ScatterChart margin={{ top: 20, right: 70, bottom: 20, left: 10 }}>
                <CartesianGrid stroke="#E3E8E2" strokeDasharray="3 3" />
                <XAxis
                  type="number" dataKey="x" name={chart.xLabel} domain={chart.xDomain}
                  tick={{ fontSize: 12, fill: "#667066" }}
                  tickFormatter={(v) => formatAxisTick(v, chart.xDomain[1] - chart.xDomain[0])}
                  axisLine={{ stroke: "#D8DED7" }} tickLine={false}
                  label={{ value: chart.xLabel, position: "insideBottom", offset: -10, fontSize: 12.5, fontWeight: 600, fill: "#14171A" }}
                />
                <YAxis
                  type="number" dataKey="y" name={chart.yLabel} domain={chart.yDomain}
                  tick={{ fontSize: 12, fill: "#667066" }}
                  tickFormatter={(v) => formatAxisTick(v, chart.yDomain[1] - chart.yDomain[0])}
                  axisLine={{ stroke: "#D8DED7" }} tickLine={false}
                  label={{ value: chart.yLabel, angle: -90, position: "insideLeft", fontSize: 12.5, fontWeight: 600, fill: "#14171A" }}
                />
                <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={chart.points} shape={<ScatterDot />} onClick={(d) => router.push(`/databaze/${d._id}`)} cursor="pointer">
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
          <p className="chart-note">{chart.points.length.toLocaleString("cs-CZ")} hráčů v grafu, jména popsána u 10 s nejvyšší hodnotou na ose Y. Klikni na bod pro otevření profilu hráče.</p>
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
  const chartRef = useRef(null);

  function generate() {
    const statLabel = axisLabel(stat);
    const gkChart = GK_STAT_KEYS.has(stat);

    let list = rows
      .filter((r) => !league || r.league_name === league)
      .filter((r) => (r.minutes_played ?? 0) >= Number(minMinutes || 0))
      .filter((r) => (gkChart ? r.bucket === "GK" : r.bucket !== "GK"))
      .filter((r) => r[stat] !== null && r[stat] !== undefined && !Number.isNaN(Number(r[stat])));

    list = [...list].sort((a, b) => dir === "desc" ? b[stat] - a[stat] : a[stat] - b[stat]);
    list = list.slice(0, Number(count)).map((r) => ({
      ...r,
      value: Number(r[stat]),
      display: formatStat(stat, r[stat]),
      statLabel,
      label: r.player_name,
    }));

    setChart({ list, statLabel, gkChart });
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
        <>
          <div className="chart-toolbar">
            <span className="chart-toolbar-title">Top {chart.list.length} — {chart.statLabel}</span>
            <DownloadButton
              targetRef={chartRef}
              filename={`fmscouts-top-${sanitizeFilename(chart.statLabel)}.png`}
              title={`Top ${chart.list.length} — ${chart.statLabel}`}
              subtitle={`${league || "Všechny ligy"} · min. ${minMinutes || 0} minut`}
            />
          </div>
          {chart.gkChart && <p className="chart-note" style={{ marginTop: 0, marginBottom: 10 }}>Zobrazeni jsou jen brankáři — zvolená statistika je brankářská.</p>}
          <div className="chart-box" ref={chartRef}>
            <Watermark />
            <ResponsiveContainer width="100%" height={Math.max(220, chart.list.length * rowHeight + 40)}>
              <BarChart data={chart.list} layout="vertical" margin={{ top: 10, right: 56, bottom: 10, left: 10 }}>
                <CartesianGrid stroke="#E3E8E2" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: "#667066" }} axisLine={{ stroke: "#D8DED7" }} tickLine={false} />
                <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 12.5, fill: "#14171A" }} axisLine={{ stroke: "#D8DED7" }} tickLine={false} interval={0} />
                <Tooltip content={<BarTooltip />} cursor={{ fill: "rgba(76,184,72,0.08)" }} />
                <Bar dataKey="value" fill="#4CB848" radius={[0, 6, 6, 0]} onClick={(d) => router.push(`/databaze/${d._id}`)} cursor="pointer">
                  <LabelList dataKey="display" position="right" style={{ fontSize: 12, fontWeight: 700, fill: "#14171A" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
