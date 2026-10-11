"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell,
} from "recharts";
import { STAT_GROUPS, STAT_LABELS, STAT_LABELS_EN, formatStat } from "../lib/statMeta";

// Each entry: [key, dropdown label (with group), plain label (for chart/axis/title)]
const EXCLUDED_AXIS_KEYS = new Set([
  "avg_rating_",
  "rank_in_league_top_attackers",
  "rank_in_league_top_midfielders",
  "rank_in_league_top_defenders",
]);

const AXIS_OPTIONS = [
  ["age", "Věk", "Věk"],
  ...Object.entries(STAT_GROUPS).flatMap(([g, keys]) =>
    keys
      .filter((k) => !EXCLUDED_AXIS_KEYS.has(k))
      .map((k) => [k, `${STAT_LABELS[k] || k} (${g})`, STAT_LABELS[k] || k])
  ),
];

const GK_STAT_KEYS = new Set(STAT_GROUPS["Brankářské"]);

// Only used to trim the scatter chart's margins/font sizes on narrow
// screens — the desktop layout below the breakpoint is untouched.
function useIsMobile(breakpoint = 700) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= breakpoint);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);
  return isMobile;
}

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
  const tier = payload?.labelTier || 0; // signed row multiplier — 0 is level with the dot, negative is above, positive is below
  const left = payload?.labelSide === "left";
  const labelY = cy + 4 + tier * 15;
  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill={fill} fillOpacity={0.78} stroke="#FFFFFF" strokeWidth={1.5} />
      {payload?.labeled && (
        <>
          {tier !== 0 && (
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
  const [yStat, setYStat] = useState("goals_per_90");
  const [chart, setChart] = useState(null);
  const chartRef = useRef(null);
  const isMobile = useIsMobile();

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

    const topIds = new Set([...points].sort((a, b) => b.y - a.y).slice(0, 5).map((p) => p._id));
    const xDomain = points.length ? computeDomain(points.map((p) => p.x)) : [0, 1];
    const yDomain = points.length ? computeDomain(points.map((p) => p.y)) : [0, 1];
    const xSpan = xDomain[1] - xDomain[0];
    const ySpan = yDomain[1] - yDomain[0] || 1;

    // Labeled points can cluster tightly in BOTH x and y (a common case —
    // several players with a similar statline). Placing each label with a
    // real 2D collision check — against every other already-placed label,
    // not just its neighbour in x — is what actually prevents overlap; a
    // name's rendered width varies a lot ("Imo Zaal" vs "Chukwuemeka
    // Emmanuel Okereke"), so that width is part of the check too.
    //
    // There's no exact pixel size available here (the chart is responsive),
    // so positions are estimated against a conservative reference box —
    // smaller than the chart typically renders at, which only ever makes
    // this *more* cautious about spacing labels out, never less.
    const REF_W = 640;
    const REF_H = isMobile ? 420 : 480;
    const CHAR_W = 6.8;
    const LABEL_H = 14;
    const ROW_H = 15;
    const DOT_GAP = 10;
    const ROW_OFFSETS = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5]; // expand outward from the dot's own row

    const dataToPxX = (x) => ((x - xDomain[0]) / xSpan) * REF_W;
    const dataToPxY = (y) => REF_H - ((y - yDomain[0]) / ySpan) * REF_H;
    const boxesOverlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

    const placedBoxes = [];
    const tierByld = new Map();
    const sideByld = new Map();
    const labeledPoints = points.filter((p) => topIds.has(p._id)).sort((a, b) => b.y - a.y);

    for (const p of labeledPoints) {
      const cxPx = dataToPxX(p.x);
      const cyPx = dataToPxY(p.y);
      const side = cxPx / REF_W > 0.82 ? "left" : "right";
      const textW = p.player_name.length * CHAR_W;

      let chosenRow = ROW_OFFSETS[ROW_OFFSETS.length - 1];
      for (const row of ROW_OFFSETS) {
        const labelCy = cyPx + 4 + row * ROW_H;
        const left = side === "left" ? cxPx - DOT_GAP - textW : cxPx + DOT_GAP;
        const box = { left, right: left + textW, top: labelCy - LABEL_H / 2, bottom: labelCy + LABEL_H / 2 };
        if (!placedBoxes.some((b) => boxesOverlap(box, b))) {
          placedBoxes.push(box);
          chosenRow = row;
          break;
        }
      }
      tierByld.set(p._id, chosenRow);
      sideByld.set(p._id, side);
    }

    points = points.map((p) => ({
      ...p,
      labeled: topIds.has(p._id),
      labelTier: tierByld.get(p._id) || 0,
      labelSide: sideByld.get(p._id) || "right",
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
            <ResponsiveContainer width="100%" height={isMobile ? 420 : 480}>
              <ScatterChart margin={isMobile ? { top: 16, right: 16, bottom: 16, left: 0 } : { top: 20, right: 70, bottom: 20, left: 10 }}>
                <CartesianGrid stroke="#E3E8E2" strokeDasharray="3 3" />
                <XAxis
                  type="number" dataKey="x" name={chart.xLabel} domain={chart.xDomain}
                  tick={{ fontSize: isMobile ? 10.5 : 12, fill: "#667066" }}
                  tickFormatter={(v) => formatAxisTick(v, chart.xDomain[1] - chart.xDomain[0])}
                  axisLine={{ stroke: "#D8DED7" }} tickLine={false}
                  label={isMobile ? undefined : { value: chart.xLabel, position: "insideBottom", offset: -10, fontSize: 12.5, fontWeight: 600, fill: "#14171A" }}
                />
                <YAxis
                  type="number" dataKey="y" name={chart.yLabel} domain={chart.yDomain}
                  tick={{ fontSize: isMobile ? 10.5 : 12, fill: "#667066" }}
                  tickFormatter={(v) => formatAxisTick(v, chart.yDomain[1] - chart.yDomain[0])}
                  axisLine={{ stroke: "#D8DED7" }} tickLine={false}
                  width={isMobile ? 34 : undefined}
                  label={isMobile ? undefined : { value: chart.yLabel, angle: -90, position: "insideLeft", fontSize: 12.5, fontWeight: 600, fill: "#14171A" }}
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
          <p className="chart-note">{chart.points.length.toLocaleString("cs-CZ")} hráčů v grafu, jména popsána u 5 s nejvyšší hodnotou na ose Y. Klikni na bod pro otevření profilu hráče.</p>
        </>
      )}
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Žebříček — graphic drawn straight onto a <canvas>.                  */
/*                                                                     */
/* The canvas IS both the on-page preview and the downloaded PNG, so   */
/* what you see is exactly what gets posted. Drawing on canvas (rather */
/* than serialising an SVG) is what lets the export use our real web   */
/* fonts (Baloo 2 / Inter) and the club logos.                         */
/* ------------------------------------------------------------------ */

const RANK_W = 1600;          // logical width; 16:9 (1600×900) for Top 10
const RANK_SCALE = 2;         // export resolution → 3200 px wide, stays sharp after X re-compression
const RANK_HEADER_H = 172;
const RANK_FOOTER_H = 84;
const RANK_PAD_X = 60;
const RANK_BAR_W = 520;
const FONT_DISPLAY = "'Baloo 2', Arial, sans-serif";
const FONT_BODY = "Inter, Arial, sans-serif";
const C = {
  ink: "#14171A", dim: "#667066", line: "#E3E8E2", accent: "#4CB848", accentDark: "#3C9A3C",
  accentSoft: "#E4F4E3", barLight: "#93D38F", track: "#EEF3EE", rowAlt: "#F6FAF5", rankBg: "#F0F3F0",
};

const RANK_TEXT = {
  cs: {
    allLeagues: "Všechny ligy",
    season: (s) => `sezóna ${s}`,
    minutes: (m) => `min. ${m} minut`,
    gkOnly: "jen brankáři",
    age: (a) => `${a} let`,
    top: (n) => `Top ${n}`,
    bottom: (n) => `${n} nejnižších`,
    asOf: (d) => `Data k ${d.toLocaleDateString("cs-CZ")}`,
    locale: "cs-CZ",
  },
  en: {
    allLeagues: "All leagues",
    season: (s) => `season ${s}`,
    minutes: (m) => `min. ${m} minutes`,
    gkOnly: "goalkeepers only",
    age: (a) => `age ${a}`,
    top: (n) => `Top ${n}`,
    bottom: (n) => `Bottom ${n}`,
    asOf: (d) => `Data as of ${d.toLocaleDateString("en-GB")}`,
    locale: "en-GB",
  },
};

// Remote logos are fetched → blob → object URL so the canvas never gets
// "tainted" (a tainted canvas can't be exported). Cached per URL.
const rankImgCache = new Map();
function loadRankImage(url) {
  if (!url) return Promise.resolve(null);
  if (!rankImgCache.has(url)) {
    rankImgCache.set(url, (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const blob = await res.blob();
        return await loadImage(URL.createObjectURL(blob));
      } catch {
        return null;
      }
    })());
  }
  return rankImgCache.get(url);
}

async function ensureRankFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load(`800 40px ${FONT_DISPLAY}`),
      document.fonts.load(`700 40px ${FONT_DISPLAY}`),
      document.fonts.load(`600 20px ${FONT_BODY}`),
      document.fonts.load(`500 20px ${FONT_BODY}`),
      document.fonts.load(`700 20px ${FONT_BODY}`),
    ]);
  } catch { /* fall back to Arial */ }
}

function rrect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawContained(ctx, img, x, y, w, h) {
  const iw = img.width || 1, ih = img.height || 1;
  const s = Math.min(w / iw, h / ih);
  const dw = iw * s, dh = ih * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

// Shrinks the font until the text fits; if even the minimum size is too
// wide, trims with an ellipsis. Returns the font size used and the text.
function fitText(ctx, text, maxW, weight, family, size, minSize) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > minSize && ctx.measureText(text).width > maxW) {
    s -= 1;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  let t = text;
  if (ctx.measureText(t).width > maxW) {
    while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
    t = t.trimEnd() + "…";
  }
  return { size: s, text: t };
}

function setSpacing(ctx, px) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`;
}

function rankLayout(n) {
  const rowH = n <= 10 ? Math.min(96, (900 - RANK_HEADER_H - RANK_FOOTER_H - 20) / n) : 58;
  const top = RANK_HEADER_H + 10;
  const height = Math.round(top + n * rowH + 10 + RANK_FOOTER_H);
  return { rowH, top, height };
}

async function drawRanking(canvas, spec) {
  const { list, kicker, title, subtitle, headerLogo, footerRight, valueLocale, subline, stat } = spec;
  await ensureRankFonts();
  const [brandLogo, headLogo, ...clubLogos] = await Promise.all([
    loadImage("/logo.jpg").catch(() => null),
    loadRankImage(headerLogo),
    ...list.map((r) => loadRankImage(r.club_logo_url)),
  ]);

  const W = RANK_W;
  const n = list.length;
  const { rowH, top, height: H } = rankLayout(n);
  const k = Math.min(1.35, rowH / 64);

  canvas.width = W * RANK_SCALE;
  canvas.height = H * RANK_SCALE;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(RANK_SCALE, 0, 0, RANK_SCALE, 0, 0);
  if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
  ctx.textBaseline = "alphabetic";

  // Background + header wash
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, 0, RANK_HEADER_H);
  grad.addColorStop(0, "#EEF8ED");
  grad.addColorStop(1, "#FFFFFF");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, RANK_HEADER_H);
  ctx.fillStyle = C.accent;
  ctx.fillRect(0, 0, W, 8);

  // Header text
  const headRight = W - RANK_PAD_X - (headLogo ? 120 : 0);
  ctx.textAlign = "left";
  ctx.fillStyle = C.accentDark;
  ctx.font = `700 19px ${FONT_BODY}`;
  setSpacing(ctx, 3);
  ctx.fillText(kicker.toLocaleUpperCase(valueLocale), RANK_PAD_X, 60);
  setSpacing(ctx, 0);
  const t = fitText(ctx, title, headRight - RANK_PAD_X, 800, FONT_DISPLAY, 60, 34);
  ctx.fillStyle = C.ink;
  ctx.fillText(t.text, RANK_PAD_X, 118);
  const st = fitText(ctx, subtitle, headRight - RANK_PAD_X, 500, FONT_BODY, 21, 15);
  ctx.fillStyle = C.dim;
  ctx.fillText(st.text, RANK_PAD_X, 152);
  if (headLogo) drawContained(ctx, headLogo, W - RANK_PAD_X - 100, (RANK_HEADER_H - 100) / 2 + 4, 100, 100);

  ctx.fillStyle = C.line;
  ctx.fillRect(0, RANK_HEADER_H - 1, W, 1);

  // Value column width — measured over every row so values line up
  const valueSize = Math.round(34 * k);
  ctx.font = `800 ${valueSize}px ${FONT_DISPLAY}`;
  const valueW = Math.max(...list.map((r) => ctx.measureText(r.display).width));

  const barX = W - RANK_PAD_X - RANK_BAR_W;
  const valueRight = barX - 22;
  const vals = list.map((r) => r.value);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;

  list.forEach((r, i) => {
    const y = top + i * rowH;
    const cy = y + rowH / 2;

    if (i % 2 === 1) {
      ctx.fillStyle = C.rowAlt;
      rrect(ctx, RANK_PAD_X - 18, y + 2, W - 2 * RANK_PAD_X + 36, rowH - 4, 12);
      ctx.fill();
    }

    // Rank badge
    const rr = 21 * k;
    const rx = RANK_PAD_X + rr;
    ctx.beginPath();
    ctx.arc(rx, cy, rr, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? C.accent : i < 3 ? C.accentSoft : C.rankBg;
    ctx.fill();
    ctx.fillStyle = i === 0 ? "#FFFFFF" : i < 3 ? C.accentDark : C.dim;
    ctx.font = `800 ${Math.round(21 * k)}px ${FONT_DISPLAY}`;
    ctx.textAlign = "center";
    ctx.fillText(String(i + 1), rx, cy + 8 * k);

    // Club logo tile
    const tile = 54 * k;
    const tx = RANK_PAD_X + rr * 2 + 20;
    const ty = cy - tile / 2;
    ctx.fillStyle = "#FFFFFF";
    rrect(ctx, tx, ty, tile, tile, 12 * k);
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const logo = clubLogos[i];
    if (logo) {
      const pad = 7 * k;
      drawContained(ctx, logo, tx + pad, ty + pad, tile - 2 * pad, tile - 2 * pad);
    } else {
      const club = String(r["Current Club"] || "?");
      const initials = club.split(/\s+/).filter((w) => /^[A-Za-zÀ-ž]/.test(w) && w.length > 2).slice(0, 2).map((w) => w[0]).join("") || club[0];
      ctx.fillStyle = C.dim;
      ctx.font = `700 ${Math.round(20 * k)}px ${FONT_DISPLAY}`;
      ctx.fillText(initials.toUpperCase(), tx + tile / 2, cy + 7 * k);
    }

    // Name + club line
    const nameX = tx + tile + 22;
    const nameMax = valueRight - valueW - 32 - nameX;
    ctx.textAlign = "left";
    const nm = fitText(ctx, String(r.player_name || "").toLocaleUpperCase(valueLocale), nameMax, 800, FONT_DISPLAY, Math.round(33 * k), 20);
    ctx.fillStyle = C.ink;
    ctx.fillText(nm.text, nameX, cy + 3 * k);
    const sub = fitText(ctx, subline(r).toLocaleUpperCase(valueLocale), nameMax, 600, FONT_BODY, Math.round(15 * k), 11);
    setSpacing(ctx, 0.6);
    ctx.fillStyle = C.dim;
    ctx.fillText(sub.text, nameX, cy + 25 * k);
    setSpacing(ctx, 0);

    // Value
    ctx.textAlign = "right";
    ctx.fillStyle = C.ink;
    ctx.font = `800 ${valueSize}px ${FONT_DISPLAY}`;
    ctx.fillText(r.display, valueRight, cy + 12 * k);

    // Bar (the leader always fills the whole track)
    const bh = 22 * k;
    ctx.fillStyle = C.track;
    rrect(ctx, barX, cy - bh / 2, RANK_BAR_W, bh, 7);
    ctx.fill();
    const len = Math.max(10, ((r.value - lo) / span) * RANK_BAR_W);
    ctx.fillStyle = i < 3 ? C.accent : C.barLight;
    rrect(ctx, barX, cy - bh / 2, len, bh, 7);
    ctx.fill();
  });

  // Footer
  const fy = H - RANK_FOOTER_H;
  ctx.fillStyle = C.line;
  ctx.fillRect(0, fy, W, 1);
  const fcy = fy + RANK_FOOTER_H / 2;
  let fx = RANK_PAD_X;
  if (brandLogo) {
    const ls = 44;
    ctx.save();
    ctx.beginPath();
    ctx.arc(fx + ls / 2, fcy, ls / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(brandLogo, fx, fcy - ls / 2, ls, ls);
    ctx.restore();
    fx += ls + 12;
  }
  ctx.textAlign = "left";
  ctx.font = `800 28px ${FONT_DISPLAY}`;
  ctx.fillStyle = C.accent;
  ctx.fillText("FM", fx, fcy + 10);
  fx += ctx.measureText("FM ").width;
  ctx.fillStyle = C.ink;
  ctx.fillText("Scouts", fx, fcy + 10);
  fx += ctx.measureText("Scouts ").width;
  ctx.fillStyle = C.dim;
  ctx.fillText("cz", fx, fcy + 10);

  ctx.textAlign = "right";
  ctx.font = `500 17px ${FONT_BODY}`;
  ctx.fillStyle = C.dim;
  ctx.fillText(footerRight, W - RANK_PAD_X, fcy + 6);
  ctx.textAlign = "left";

  return { top, rowH, height: H };
}

function TopPanel({ rows, leagues, router }) {
  const [league, setLeague] = useState("");
  const [minMinutes, setMinMinutes] = useState("450");
  const [stat, setStat] = useState("goals_per_90");
  const [count, setCount] = useState("10");
  const [dir, setDir] = useState("desc");
  const [lang, setLang] = useState("cs");
  const [customTitle, setCustomTitle] = useState("");
  const [chart, setChart] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const canvasRef = useRef(null);
  const geomRef = useRef(null);

  function generate() {
    const gkChart = GK_STAT_KEYS.has(stat);

    let list = rows
      .filter((r) => !league || r.league_name === league)
      .filter((r) => (r.minutes_played ?? 0) >= Number(minMinutes || 0))
      .filter((r) => (gkChart ? r.bucket === "GK" : r.bucket !== "GK"))
      .filter((r) => r[stat] !== null && r[stat] !== undefined && r[stat] !== "" && !Number.isNaN(Number(r[stat])));

    list = [...list].sort((a, b) => dir === "desc" ? b[stat] - a[stat] : a[stat] - b[stat]);
    list = list.slice(0, Number(count)).map((r) => ({ ...r, value: Number(r[stat]) }));

    const seasons = [...new Set(list.map((r) => r.season).filter(Boolean))];
    const leagueLogo = league ? list.find((r) => r.league_logo_url)?.league_logo_url || null : null;

    setChart({ list, stat, gkChart, league, minMinutes: minMinutes || "0", dir, season: seasons.length === 1 ? seasons[0] : null, leagueLogo });
  }

  // Redraw whenever the data, language or custom title changes.
  useEffect(() => {
    if (!chart || !chart.list.length || !canvasRef.current) return;
    let cancelled = false;
    const tx = RANK_TEXT[lang];
    const statLabel = lang === "en" ? (STAT_LABELS_EN[chart.stat] || axisLabel(chart.stat)) : axisLabel(chart.stat);
    const n = chart.list.length;
    const spec = {
      stat: chart.stat,
      valueLocale: tx.locale,
      kicker: chart.dir === "desc" ? tx.top(n) : tx.bottom(n),
      title: customTitle.trim() || statLabel,
      subtitle: [
        chart.league || tx.allLeagues,
        chart.season && tx.season(chart.season),
        tx.minutes(chart.minMinutes),
        chart.gkChart && tx.gkOnly,
      ].filter(Boolean).join("  ·  "),
      headerLogo: chart.leagueLogo,
      footerRight: tx.asOf(new Date()),
      subline: (r) => [
        r["Current Club"],
        !chart.league && r.league_name,
        r.age !== null && r.age !== undefined && r.age !== "" && tx.age(r.age),
      ].filter(Boolean).join("  ·  "),
      list: chart.list.map((r) => ({ ...r, display: formatStat(chart.stat, r.value, tx.locale) })),
    };
    setDrawing(true);
    drawRanking(canvasRef.current, spec)
      .then((g) => { if (!cancelled) geomRef.current = g; })
      .catch((e) => console.error(e))
      .finally(() => { if (!cancelled) setDrawing(false); });
    return () => { cancelled = true; };
  }, [chart, lang, customTitle]);

  function rowAt(e) {
    const g = geomRef.current;
    const canvas = canvasRef.current;
    if (!g || !canvas || !chart) return -1;
    const rect = canvas.getBoundingClientRect();
    const y = (e.clientY - rect.top) * (g.height / rect.height);
    const i = Math.floor((y - g.top) / g.rowH);
    return i >= 0 && i < chart.list.length ? i : -1;
  }

  function download() {
    const canvas = canvasRef.current;
    if (!canvas || !chart) return;
    const statLabel = axisLabel(chart.stat);
    canvas.toBlob((blob) => {
      if (!blob) {
        alert("Stažení se nepovedlo — zkus to prosím znovu.");
        return;
      }
      const link = document.createElement("a");
      link.download = `fmscouts-top-${sanitizeFilename(statLabel)}${chart.league ? "-" + sanitizeFilename(chart.league) : ""}${lang === "en" ? "-en" : ""}.png`;
      link.href = URL.createObjectURL(blob);
      link.click();
    }, "image/png");
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
              <option value="5">Top 5</option>
              <option value="10">Top 10</option>
              <option value="20">Top 20</option>
              <option value="50">Top 50</option>
            </select>
          </div>
          <div className="field">
            <div className="field-label">Vlastní nadpis (nepovinné)</div>
            <input type="text" value={customTitle} placeholder="např. Nejlepší střelci ligy" onChange={(e) => setCustomTitle(e.target.value)} />
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          <button className={dir === "desc" ? "btn chart-dir-active" : "btn"} onClick={() => setDir("desc")}>↓ Nejvyšší první</button>
          <button className={dir === "asc" ? "btn chart-dir-active" : "btn"} onClick={() => setDir("asc")}>↑ Nejnižší první</button>
          <span style={{ width: 12 }} />
          <button className={lang === "cs" ? "btn chart-dir-active" : "btn"} onClick={() => setLang("cs")}>CZ</button>
          <button className={lang === "en" ? "btn chart-dir-active" : "btn"} onClick={() => setLang("en")}>EN</button>
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
            <span className="chart-toolbar-title">{drawing ? "Kreslím žebříček…" : "Náhled = stažený obrázek"}</span>
            <button className="btn chart-download-btn" onClick={download} disabled={drawing}>⬇ Stáhnout graf</button>
          </div>
          <canvas
            ref={canvasRef}
            onClick={(e) => { const i = rowAt(e); if (i >= 0) router.push(`/databaze/${chart.list[i]._id}`); }}
            onMouseMove={(e) => { e.currentTarget.style.cursor = rowAt(e) >= 0 ? "pointer" : "default"; }}
            style={{ display: "block", width: "100%", height: "auto", borderRadius: 12, border: "1px solid #E3E8E2", boxShadow: "0 4px 18px rgba(20,23,26,0.06)" }}
          />
          <p className="chart-note">Obrázek se stahuje ve 3200 px šířce (Top 10 = formát 16:9, ideální pro X). Klikni na řádek pro otevření profilu hráče.</p>
        </>
      )}
    </div>
  );
}
