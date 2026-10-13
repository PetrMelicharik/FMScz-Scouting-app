"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { playerHref } from "../lib/playerUrl";
import { STAT_GROUPS, STAT_LABELS, STAT_LABELS_EN, formatStat } from "../lib/statMeta";
import { stripDiacritics } from "../lib/normalize";
import { supabase } from "../lib/supabaseClient";
import { useAuthUser } from "../lib/useAuthUser";
import { buildPlayerIndex, shortlistKeySet, rowKey } from "../lib/shortlist";

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
const POSITION_COLORS = { GK: "#E09A1A", DF: "#3B7DE0", MF: "#4CB848", FW: "#E0484D", other: "#9AA39A" };
const POSITION_LABELS = { GK: "Brankář", DF: "Obránce", MF: "Záložník", FW: "Útočník", other: "Ostatní" };
const POSITION_LABELS_EN = { GK: "Goalkeeper", DF: "Defender", MF: "Midfielder", FW: "Forward", other: "Other" };

// Position filter shared by both charts. Goalkeepers are handled separately
// (a goalkeeper stat always shows goalkeepers only), so the filter covers
// outfield positions. All three selected (or none) = no filtering.
const FILTER_POSITIONS = ["FW", "MF", "DF"];
const POSITION_PLURAL = {
  cs: { FW: "útočníci", MF: "záložníci", DF: "obránci" },
  en: { FW: "forwards", MF: "midfielders", DF: "defenders" },
};

function isAllPositions(sel) {
  return !sel || sel.length === 0 || FILTER_POSITIONS.every((b) => sel.includes(b));
}

function matchesPositions(row, sel) {
  return isAllPositions(sel) || sel.includes(row.bucket);
}

function positionsText(sel, lang) {
  if (isAllPositions(sel)) return null;
  return FILTER_POSITIONS.filter((b) => sel.includes(b)).map((b) => POSITION_PLURAL[lang][b]).join(" + ");
}

function PositionFilter({ value, onChange, disabled }) {
  const toggle = (b) => onChange(value.includes(b) ? value.filter((x) => x !== b) : [...value, b]);
  return (
    <div className="field">
      <div className="field-label">Pozice{disabled ? " (u brankářské statistiky jen brankáři)" : ""}</div>
      <div className="chip-row" style={{ opacity: disabled ? 0.45 : 1, pointerEvents: disabled ? "none" : "auto" }}>
        {FILTER_POSITIONS.map((b) => (
          <button
            key={b}
            type="button"
            className={value.includes(b) ? "chip active" : "chip"}
            onClick={() => toggle(b)}
            style={value.includes(b) ? { background: POSITION_COLORS[b], borderColor: POSITION_COLORS[b] } : undefined}
          >
            {POSITION_LABELS[b]}
          </button>
        ))}
      </div>
    </div>
  );
}

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

// Shared card chrome — the ranking and the scatter chart use the exact same
// header and footer so every graphic posted on X reads as one series.
function drawCardHeader(ctx, W, H, { kicker, title, subtitle, headLogo, locale }) {
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, 0, RANK_HEADER_H);
  grad.addColorStop(0, "#EEF8ED");
  grad.addColorStop(1, "#FFFFFF");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, RANK_HEADER_H);
  ctx.fillStyle = C.accent;
  ctx.fillRect(0, 0, W, 8);

  const headRight = W - RANK_PAD_X - (headLogo ? 120 : 0);
  ctx.textAlign = "left";
  ctx.fillStyle = C.accentDark;
  ctx.font = `700 19px ${FONT_BODY}`;
  setSpacing(ctx, 3);
  ctx.fillText(kicker.toLocaleUpperCase(locale), RANK_PAD_X, 60);
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
}

// legend: optional [{ label, color }] drawn centred in the footer.
function drawCardFooter(ctx, W, H, brandLogo, footerRight, legend) {
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

  if (legend && legend.length) {
    ctx.font = `600 17px ${FONT_BODY}`;
    const gap = 30, dot = 14;
    const widths = legend.map((l) => (l.dash ? l.lineW : dot) + 9 + ctx.measureText(l.label).width);
    let lx = W / 2 - (widths.reduce((a, b) => a + b, 0) + gap * (legend.length - 1)) / 2;
    legend.forEach((l, i) => {
      if (l.dash) {
        ctx.strokeStyle = l.color;
        ctx.lineWidth = 2.5;
        ctx.setLineDash(l.dash);
        ctx.beginPath();
        ctx.moveTo(lx, fcy);
        ctx.lineTo(lx + l.lineW, fcy);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.beginPath();
        ctx.arc(lx + dot / 2, fcy, dot / 2, 0, Math.PI * 2);
        ctx.fillStyle = l.color;
        ctx.fill();
      }
      ctx.fillStyle = C.ink;
      ctx.fillText(l.label, lx + (l.dash ? l.lineW : dot) + 9, fcy + 6);
      lx += widths[i] + gap;
    });
  }

  ctx.textAlign = "right";
  ctx.font = `500 17px ${FONT_BODY}`;
  ctx.fillStyle = C.dim;
  ctx.fillText(footerRight, W - RANK_PAD_X, fcy + 6);
  ctx.textAlign = "left";
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
  const anyStamp = list.some((r) => r.shortlisted);
  const [brandLogo, stampImg, headLogo, ...clubLogos] = await Promise.all([
    loadImage("/logo.jpg").catch(() => null),
    anyStamp ? loadImage("/approved-stamp.png").catch(() => null) : Promise.resolve(null),
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

  drawCardHeader(ctx, W, H, { kicker, title, subtitle, headLogo, locale: valueLocale });

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

  // "Approved by FM Scouts" stamp for players on the user's shortlist —
  // sits between the name and the value, slightly tilted and a bit taller
  // than the row, like a real rubber stamp.
  const stampSize = Math.min(120, rowH * 1.3);
  const stampBaseCx = valueRight - valueW - 24 - stampSize / 2;
  // Stamps on consecutive rows are staggered so they don't sit on top of each other
  const stampCxs = [];
  list.forEach((r, i) => {
    const prev = i > 0 && list[i - 1].shortlisted ? stampCxs[i - 1] : null;
    stampCxs[i] = prev !== null && prev === stampBaseCx ? stampBaseCx - stampSize * 0.62 : stampBaseCx;
  });

  list.forEach((r, i) => {
    const y = top + i * rowH;
    const cy = y + rowH / 2;

    if (r.shortlisted && stampImg) {
      ctx.fillStyle = "#E6F5E4";
      rrect(ctx, RANK_PAD_X - 18, y + 2, W - 2 * RANK_PAD_X + 36, rowH - 4, 12);
      ctx.fill();
    } else if (i % 2 === 1) {
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
    const nameMax = r.shortlisted && stampImg ? stampCxs[i] - stampSize / 2 + 6 - nameX : valueRight - valueW - 32 - nameX;
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

  if (stampImg) {
    list.forEach((r, i) => {
      if (!r.shortlisted) return;
      const cy = top + i * rowH + rowH / 2;
      const sw = stampSize;
      const sh = stampSize * (stampImg.height / stampImg.width);
      ctx.save();
      ctx.translate(stampCxs[i], cy);
      ctx.rotate((-9 * Math.PI) / 180);
      ctx.drawImage(stampImg, -sw / 2, -sh / 2, sw, sh);
      ctx.restore();
    });
  }

  drawCardFooter(ctx, W, H, brandLogo, footerRight);

  return { top, rowH, height: H };
}

function TopPanel({ rows, leagues, router }) {
  const [league, setLeague] = useState("");
  const [minMinutes, setMinMinutes] = useState("450");
  const [stat, setStat] = useState("goals_per_90");
  const [count, setCount] = useState("10");
  const [dir, setDir] = useState("desc");
  const [positions, setPositions] = useState(FILTER_POSITIONS);
  const [lang, setLang] = useState("cs");
  const [customTitle, setCustomTitle] = useState("");
  const [showStamp, setShowStamp] = useState(true);
  const [shortlist, setShortlist] = useState([]);
  const user = useAuthUser();
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
      .filter((r) => gkChart || matchesPositions(r, positions))
      .filter((r) => r[stat] !== null && r[stat] !== undefined && r[stat] !== "" && !Number.isNaN(Number(r[stat])));

    list = [...list].sort((a, b) => dir === "desc" ? b[stat] - a[stat] : a[stat] - b[stat]);
    list = list.slice(0, Number(count)).map((r) => ({ ...r, value: Number(r[stat]) }));

    const seasons = [...new Set(list.map((r) => r.season).filter(Boolean))];
    const leagueLogo = league ? list.find((r) => r.league_logo_url)?.league_logo_url || null : null;

    setChart({ list, stat, gkChart, league, minMinutes: minMinutes || "0", dir, season: seasons.length === 1 ? seasons[0] : null, leagueLogo, positions: gkChart ? null : [...positions] });
  }

  // The logged-in user's shortlist (RLS returns only their own rows).
  useEffect(() => {
    if (!user) { setShortlist([]); return; }
    let cancelled = false;
    supabase
      .from("shortlist_players")
      .select("*")
      .eq("user_id", user.id)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error(error); return; }
        setShortlist(data || []);
      });
    return () => { cancelled = true; };
  }, [user]);

  // Matched by stable key (name + date of birth), see lib/shortlist.js.
  const isShortlisted = useMemo(() => {
    const keys = shortlistKeySet(shortlist, buildPlayerIndex(rows));
    return (r) => keys.has(rowKey(r));
  }, [shortlist, rows]);

  // Redraw whenever the data, language, title or stamp setting changes.
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
        chart.positions && positionsText(chart.positions, lang),
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
      list: chart.list.map((r) => ({ ...r, display: formatStat(chart.stat, r.value, tx.locale), shortlisted: showStamp && isShortlisted(r) })),
    };
    setDrawing(true);
    drawRanking(canvasRef.current, spec)
      .then((g) => { if (!cancelled) geomRef.current = g; })
      .catch((e) => console.error(e))
      .finally(() => { if (!cancelled) setDrawing(false); });
    return () => { cancelled = true; };
  }, [chart, lang, customTitle, showStamp, isShortlisted]);

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
          <PositionFilter value={positions} onChange={setPositions} disabled={GK_STAT_KEYS.has(stat)} />
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
          <span style={{ width: 12 }} />
          <button className={showStamp ? "btn chart-dir-active" : "btn"} onClick={() => setShowStamp((v) => !v)} title="U hráčů z tvého shortlistu se zobrazí razítko Approved by FM Scouts">
            {showStamp ? "✓ " : ""}Razítko u hráčů ze shortlistu
          </button>
        </div>
        {showStamp && user === null && (
          <p className="chart-note" style={{ marginTop: -6, marginBottom: 12 }}>Pro razítko se přihlas (na stránce Shortlist) — jinak appka tvůj shortlist nevidí.</p>
        )}
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
            onClick={(e) => { const i = rowAt(e); if (i >= 0) router.push(playerHref(chart.list[i])); }}
            onMouseMove={(e) => { e.currentTarget.style.cursor = rowAt(e) >= 0 ? "pointer" : "default"; }}
            style={{ display: "block", width: "100%", height: "auto", borderRadius: 12, border: "1px solid #E3E8E2", boxShadow: "0 4px 18px rgba(20,23,26,0.06)" }}
          />
          <p className="chart-note">Obrázek se stahuje ve 3200 px šířce (Top 10 = formát 16:9, ideální pro X). Klikni na řádek pro otevření profilu hráče.</p>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bodový graf — same canvas approach and card chrome as the ranking.  */
/* ------------------------------------------------------------------ */

const SC_H = 900; // 1600×900 = 16:9
const SC_PLOT = { left: 150, right: RANK_W - 70, top: RANK_HEADER_H + 44, bottom: SC_H - RANK_FOOTER_H - 96 };

// Stats measured in the same unit — for these pairs a y = x diagonal is
// drawn (e.g. góly vs. xG: above the line = scoring more than expected).
const SAME_UNIT_GROUPS = [
  ["goals", "xg", "npxg"],
  ["goals_per_90", "xg_per_90", "npxg_per_90"],
  ["assists", "xa"],
  ["assists_per_90", "xa_per_90"],
];
function sameUnit(a, b) {
  return a !== b && SAME_UNIT_GROUPS.some((g) => g.includes(a) && g.includes(b));
}

function niceTicks(lo, hi, target = 6) {
  const span = hi - lo || 1;
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return { ticks, decimals };
}

function isPercentStat(key) {
  return key.includes("percentage") || key.includes("rate");
}

function boxesHit(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function clubInitials(club) {
  const c = String(club || "?");
  return (c.split(/\s+/).filter((w) => /^[A-Za-zÀ-ž]/.test(w) && w.length > 2).slice(0, 2).map((w) => w[0]).join("") || c[0]).toUpperCase();
}

async function drawScatter(canvas, spec) {
  const {
    points, highlightIds, xKey, yKey, xLabel, yLabel, xDomain, yDomain, means,
    kicker, title, subtitle, headerLogo, footerRight, locale, legend, avgWord, diagonal,
  } = spec;
  await ensureRankFonts();
  const hl = points.filter((p) => highlightIds.has(p._id));
  const [brandLogo, headLogo, ...logos] = await Promise.all([
    loadImage("/logo.jpg").catch(() => null),
    loadRankImage(headerLogo),
    ...hl.map((p) => loadRankImage(p.club_logo_url)),
  ]);
  const logoById = new Map(hl.map((p, i) => [p._id, logos[i]]));

  const W = RANK_W, H = SC_H, P = SC_PLOT;
  canvas.width = W * RANK_SCALE;
  canvas.height = H * RANK_SCALE;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(RANK_SCALE, 0, 0, RANK_SCALE, 0, 0);
  if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";

  drawCardHeader(ctx, W, H, { kicker, title, subtitle, headLogo, locale });

  const px = (x) => P.left + ((x - xDomain[0]) / (xDomain[1] - xDomain[0] || 1)) * (P.right - P.left);
  const py = (y) => P.bottom - ((y - yDomain[0]) / (yDomain[1] - yDomain[0] || 1)) * (P.bottom - P.top);

  // Grid + ticks
  const xt = niceTicks(xDomain[0], xDomain[1], 7);
  const yt = niceTicks(yDomain[0], yDomain[1], 6);
  const fmtTick = (v, d, key) => v.toFixed(d) + (isPercentStat(key) ? "%" : "");
  ctx.lineWidth = 1;
  ctx.font = `500 17px ${FONT_BODY}`;
  ctx.fillStyle = C.dim;
  ctx.textAlign = "center";
  xt.ticks.forEach((v) => {
    const x = px(v);
    if (x < P.left - 1 || x > P.right + 1) return;
    ctx.fillStyle = C.line;
    ctx.fillRect(Math.round(x), P.top, 1, P.bottom - P.top);
    ctx.fillStyle = C.dim;
    ctx.fillText(fmtTick(v, xt.decimals, xKey), x, P.bottom + 30);
  });
  ctx.textAlign = "right";
  yt.ticks.forEach((v) => {
    const y = py(v);
    if (y < P.top - 1 || y > P.bottom + 1) return;
    ctx.fillStyle = C.line;
    ctx.fillRect(P.left, Math.round(y), P.right - P.left, 1);
    ctx.fillStyle = C.dim;
    ctx.fillText(fmtTick(v, yt.decimals, yKey), P.left - 14, y + 6);
  });
  ctx.fillStyle = "#CFD6CE";
  ctx.fillRect(P.left, P.bottom, P.right - P.left, 1.5);
  ctx.fillRect(P.left - 1, P.top, 1.5, P.bottom - P.top);

  // Axis titles
  ctx.fillStyle = C.ink;
  ctx.font = `700 23px ${FONT_DISPLAY}`;
  ctx.textAlign = "center";
  ctx.fillText(xLabel, (P.left + P.right) / 2, P.bottom + 70);
  ctx.save();
  ctx.translate(52, (P.top + P.bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();

  // Reference lines (clipped to the plot)
  ctx.save();
  ctx.beginPath();
  ctx.rect(P.left, P.top, P.right - P.left, P.bottom - P.top);
  ctx.clip();
  if (diagonal) {
    const a = Math.max(xDomain[0], yDomain[0]);
    const b = Math.min(xDomain[1], yDomain[1]);
    if (b > a) {
      ctx.strokeStyle = "#AEB6AD";
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.moveTo(px(a), py(a));
      ctx.lineTo(px(b), py(b));
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.strokeStyle = "rgba(60,154,60,0.55)";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 7]);
  ctx.beginPath();
  ctx.moveTo(px(means.x), P.top);
  ctx.lineTo(px(means.x), P.bottom);
  ctx.moveTo(P.left, py(means.y));
  ctx.lineTo(P.right, py(means.y));
  ctx.stroke();
  ctx.setLineDash([]);

  // Background dots
  const sorted = [...points].sort((a, b) => (highlightIds.has(a._id) ? 1 : 0) - (highlightIds.has(b._id) ? 1 : 0));
  // Big datasets (all leagues) get smaller, lighter dots so clusters stay readable
  const dotR = points.length > 1500 ? 5.5 : points.length > 400 ? 7 : 8.5;
  const dotA = points.length > 1500 ? 0.45 : points.length > 400 ? 0.55 : 0.62;
  sorted.forEach((p) => {
    if (highlightIds.has(p._id)) return;
    ctx.beginPath();
    ctx.arc(px(p.x), py(p.y), dotR, 0, Math.PI * 2);
    ctx.globalAlpha = dotA;
    ctx.fillStyle = POSITION_COLORS[p.bucket];
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = dotR > 6 ? 1.5 : 1;
    ctx.stroke();
  });
  ctx.restore();

  // Labels for reference lines
  ctx.font = `600 15px ${FONT_BODY}`;
  ctx.fillStyle = C.accentDark;
  ctx.textAlign = "left";
  ctx.fillText(`${avgWord} ${means.xDisplay}`, px(means.x) + 8, P.top + 18);
  ctx.textAlign = "right";
  ctx.fillText(`${avgWord} ${means.yDisplay}`, P.right - 8, py(means.y) - 9);

  // Highlighted players: logo badge + name pill, placed without collisions
  const R = 19;
  const geo = hl.map((p) => ({ p, x: px(p.x), y: py(p.y) }));
  const obstacles = geo.map((g) => ({ id: g.p._id, left: g.x - R - 3, right: g.x + R + 3, top: g.y - R - 3, bottom: g.y + R + 3 }));
  const placed = [];
  const bounds = { left: P.left + 4, right: P.right - 4, top: P.top + 4, bottom: P.bottom - 4 };
  const inBounds = (b) => b.left >= bounds.left && b.right <= bounds.right && b.top >= bounds.top && b.bottom <= bounds.bottom;
  ctx.font = `700 20px ${FONT_DISPLAY}`;
  const labels = geo
    .sort((a, b) => a.y - b.y)
    .map((g) => {
      const name = String(g.p.player_name || "");
      const bw = ctx.measureText(name).width + 26;
      const bh = 34;
      const gap = R + 8;
      const prefRight = g.x + gap + bw <= bounds.right;
      const sides = prefRight ? ["r", "l"] : ["l", "r"];
      const cands = [];
      for (const dy of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5]) {
        for (const side of sides) {
          const left = side === "r" ? g.x + gap : g.x - gap - bw;
          cands.push({ left, right: left + bw, top: g.y - bh / 2 + dy * 40, bottom: g.y + bh / 2 + dy * 40, dy });
        }
        if (dy === 0) {
          cands.push({ left: g.x - bw / 2, right: g.x + bw / 2, top: g.y - R - 10 - bh, bottom: g.y - R - 10, dy: 0, above: true });
          cands.push({ left: g.x - bw / 2, right: g.x + bw / 2, top: g.y + R + 10, bottom: g.y + R + 10 + bh, dy: 0, below: true });
        }
      }
      const ok = (b) => inBounds(b) && !placed.some((o) => boxesHit(b, o)) && !obstacles.some((o) => o.id !== g.p._id && boxesHit(b, o));
      const box = cands.find(ok) || cands.find(inBounds) || cands[0];
      placed.push(box);
      return { g, box, name };
    });

  // Leader lines first (under badges and pills)
  labels.forEach(({ g, box }) => {
    if (box.dy === 0) return;
    const tx = box.left > g.x ? box.left : box.right;
    const ty = (box.top + box.bottom) / 2;
    ctx.strokeStyle = "#9AA39A";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(g.x, g.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  });

  // Badges
  geo.forEach((g) => {
    const color = POSITION_COLORS[g.p.bucket];
    ctx.beginPath();
    ctx.arc(g.x, g.y, R, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = color;
    ctx.stroke();
    const logo = logoById.get(g.p._id);
    if (logo) {
      drawContained(ctx, logo, g.x - 12, g.y - 12, 24, 24);
    } else {
      ctx.fillStyle = C.dim;
      ctx.font = `700 14px ${FONT_DISPLAY}`;
      ctx.textAlign = "center";
      ctx.fillText(clubInitials(g.p["Current Club"]), g.x, g.y + 5);
    }
  });

  // Name pills
  labels.forEach(({ g, box, name }) => {
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    rrect(ctx, box.left, box.top, box.right - box.left, box.bottom - box.top, 17);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = POSITION_COLORS[g.p.bucket];
    ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.font = `700 20px ${FONT_DISPLAY}`;
    ctx.textAlign = "center";
    ctx.fillText(name, (box.left + box.right) / 2, box.bottom - 10);
  });

  drawCardFooter(ctx, W, H, brandLogo, footerRight, legend);

  return {
    W, H,
    hits: points.map((p) => ({ p, x: px(p.x), y: py(p.y), r: highlightIds.has(p._id) ? R + 2 : 12 })),
  };
}

function hracuCs(n) {
  if (n === 1) return "hráč";
  if (n >= 2 && n <= 4) return "hráči";
  return "hráčů";
}

function ScatterPanel({ rows, leagues, router }) {
  const [league, setLeague] = useState("");
  const [minMinutes, setMinMinutes] = useState("450");
  const [xStat, setXStat] = useState("xg_per_90");
  const [yStat, setYStat] = useState("goals_per_90");
  const [labelCount, setLabelCount] = useState("5");
  const [labelBy, setLabelBy] = useState("sum");
  const [positions, setPositions] = useState(FILTER_POSITIONS);
  const [highlight, setHighlight] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [lang, setLang] = useState("cs");
  const [chart, setChart] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [hover, setHover] = useState(null);
  const canvasRef = useRef(null);
  const geomRef = useRef(null);

  function generate() {
    const gkChart = GK_STAT_KEYS.has(xStat) || GK_STAT_KEYS.has(yStat);
    const points = rows
      .filter((r) => !league || r.league_name === league)
      .filter((r) => (r.minutes_played ?? 0) >= Number(minMinutes || 0))
      .filter((r) => (gkChart ? r.bucket === "GK" : r.bucket !== "GK"))
      .filter((r) => gkChart || matchesPositions(r, positions))
      .filter((r) => r[xStat] !== null && r[xStat] !== undefined && r[xStat] !== "" && r[yStat] !== null && r[yStat] !== undefined && r[yStat] !== "")
      .map((r) => ({ ...r, x: Number(r[xStat]), y: Number(r[yStat]) }))
      .filter((r) => !Number.isNaN(r.x) && !Number.isNaN(r.y));

    const xDomain = points.length ? computeDomain(points.map((p) => p.x)) : [0, 1];
    const yDomain = points.length ? computeDomain(points.map((p) => p.y)) : [0, 1];

    // Who gets a logo + name: top N by the chosen rule, plus anyone typed
    // into "Zvýraznit hráče".
    const xs = xDomain[1] - xDomain[0] || 1, ys = yDomain[1] - yDomain[0] || 1;
    const score = (p) => labelBy === "x" ? p.x : labelBy === "y" ? p.y : (p.x - xDomain[0]) / xs + (p.y - yDomain[0]) / ys;
    const ids = new Set([...points].sort((a, b) => score(b) - score(a)).slice(0, Number(labelCount)).map((p) => p._id));
    const wanted = highlight.split(",").map((s) => stripDiacritics(s.trim().toLowerCase())).filter((s) => s.length >= 3);
    const notFound = [];
    wanted.forEach((w) => {
      const hit = points.filter((p) => stripDiacritics(String(p.player_name || "").toLowerCase()).includes(w));
      if (hit.length) hit.slice(0, 3).forEach((p) => ids.add(p._id));
      else notFound.push(w);
    });

    const mean = (arr) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
    const seasons = [...new Set(points.map((r) => r.season).filter(Boolean))];
    const leagueLogo = league ? points.find((r) => r.league_logo_url)?.league_logo_url || null : null;

    setHover(null);
    setChart({
      points, xStat, yStat, gkChart, league, minMinutes: minMinutes || "0",
      season: seasons.length === 1 ? seasons[0] : null, leagueLogo,
      highlightIds: ids, notFound, xDomain, yDomain, positions: gkChart ? null : [...positions],
      means: { x: mean(points.map((p) => p.x)), y: mean(points.map((p) => p.y)) },
    });
  }

  useEffect(() => {
    if (!chart || !chart.points.length || !canvasRef.current) return;
    let cancelled = false;
    const tx = RANK_TEXT[lang];
    const lab = (k) => (lang === "en" ? (STAT_LABELS_EN[k] || axisLabel(k)) : axisLabel(k));
    const xLabel = lab(chart.xStat), yLabel = lab(chart.yStat);
    const n = chart.points.length;
    const posLabels = lang === "en" ? POSITION_LABELS_EN : POSITION_LABELS;
    const present = new Set(chart.points.map((p) => p.bucket));
    const spec = {
      points: chart.points,
      highlightIds: chart.highlightIds,
      xKey: chart.xStat, yKey: chart.yStat, xLabel, yLabel,
      xDomain: chart.xDomain, yDomain: chart.yDomain,
      means: {
        ...chart.means,
        xDisplay: formatStat(chart.xStat, chart.means.x, tx.locale),
        yDisplay: formatStat(chart.yStat, chart.means.y, tx.locale),
      },
      kicker: lang === "en" ? `Player comparison · ${n} players` : `Srovnání hráčů · ${n} ${hracuCs(n)}`,
      title: customTitle.trim() || `${yLabel} vs. ${xLabel}`,
      subtitle: [
        chart.league || tx.allLeagues,
        chart.season && tx.season(chart.season),
        chart.positions && positionsText(chart.positions, lang),
        tx.minutes(chart.minMinutes),
        chart.gkChart && tx.gkOnly,
      ].filter(Boolean).join("  ·  "),
      headerLogo: chart.leagueLogo,
      footerRight: tx.asOf(new Date()),
      locale: tx.locale,
      legend: [
        ...(chart.gkChart ? [] : ["FW", "MF", "DF", "other"].filter((b) => present.has(b)).map((b) => ({ label: posLabels[b], color: POSITION_COLORS[b] }))),
        { label: lang === "en" ? "average" : "průměr", color: "rgba(60,154,60,0.75)", dash: [7, 5], lineW: 30 },
        ...(sameUnit(chart.xStat, chart.yStat) ? [{ label: `${yLabel} = ${xLabel}`, color: "#9AA39A", dash: [2, 5], lineW: 30 }] : []),
      ],
      avgWord: lang === "en" ? "avg" : "průměr",
      diagonal: sameUnit(chart.xStat, chart.yStat),
    };
    setDrawing(true);
    drawScatter(canvasRef.current, spec)
      .then((g) => { if (!cancelled) geomRef.current = g; })
      .catch((e) => console.error(e))
      .finally(() => { if (!cancelled) setDrawing(false); });
    return () => { cancelled = true; };
  }, [chart, lang, customTitle]);

  function hitAt(e) {
    const g = geomRef.current;
    const canvas = canvasRef.current;
    if (!g || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const k = g.W / rect.width;
    const x = (e.clientX - rect.left) * k;
    const y = (e.clientY - rect.top) * k;
    let best = null, bestD = Infinity;
    for (const h of g.hits) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d <= h.r && d < bestD) { best = h; bestD = d; }
    }
    return best ? { ...best, cssX: best.x / k, cssY: best.y / k } : null;
  }

  function download() {
    const canvas = canvasRef.current;
    if (!canvas || !chart) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        alert("Stažení se nepovedlo — zkus to prosím znovu.");
        return;
      }
      const link = document.createElement("a");
      link.download = `fmscouts-${sanitizeFilename(axisLabel(chart.yStat))}-vs-${sanitizeFilename(axisLabel(chart.xStat))}${chart.league ? "-" + sanitizeFilename(chart.league) : ""}${lang === "en" ? "-en" : ""}.png`;
      link.href = URL.createObjectURL(blob);
      link.click();
    }, "image/png");
  }

  const hp = hover?.p;

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
          <PositionFilter value={positions} onChange={setPositions} disabled={GK_STAT_KEYS.has(xStat) || GK_STAT_KEYS.has(yStat)} />
          <div className="field">
            <div className="field-label">Popsaní hráči</div>
            <select value={labelCount} onChange={(e) => setLabelCount(e.target.value)}>
              <option value="0">Žádní</option>
              <option value="3">Top 3</option>
              <option value="5">Top 5</option>
              <option value="8">Top 8</option>
              <option value="10">Top 10</option>
            </select>
          </div>
          <div className="field">
            <div className="field-label">Top podle</div>
            <select value={labelBy} onChange={(e) => setLabelBy(e.target.value)}>
              <option value="sum">Obou os (vpravo nahoře)</option>
              <option value="y">Osy Y</option>
              <option value="x">Osy X</option>
            </select>
          </div>
          <div className="field">
            <div className="field-label">Zvýraznit hráče (nepovinné)</div>
            <input type="text" value={highlight} placeholder="např. Mikuš, Chory" onChange={(e) => setHighlight(e.target.value)} />
          </div>
          <div className="field">
            <div className="field-label">Vlastní nadpis (nepovinné)</div>
            <input type="text" value={customTitle} placeholder="např. Kdo překonává svá xG?" onChange={(e) => setCustomTitle(e.target.value)} />
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          <button className={lang === "cs" ? "btn chart-dir-active" : "btn"} onClick={() => setLang("cs")}>CZ</button>
          <button className={lang === "en" ? "btn chart-dir-active" : "btn"} onClick={() => setLang("en")}>EN</button>
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
            <span className="chart-toolbar-title">{drawing ? "Kreslím graf…" : "Náhled = stažený obrázek"}</span>
            <button className="btn chart-download-btn" onClick={download} disabled={drawing}>⬇ Stáhnout graf</button>
          </div>
          {chart.notFound.length > 0 && (
            <p className="chart-note" style={{ marginTop: 0, marginBottom: 10 }}>
              V grafu nejsou: {chart.notFound.join(", ")} (zkontroluj jméno, ligu nebo min. minuty).
            </p>
          )}
          <div style={{ position: "relative" }}>
            <canvas
              ref={canvasRef}
              onClick={(e) => { const h = hitAt(e); if (h) router.push(playerHref(h.p)); }}
              onMouseMove={(e) => { const h = hitAt(e); e.currentTarget.style.cursor = h ? "pointer" : "default"; setHover(h); }}
              onMouseLeave={() => setHover(null)}
              style={{ display: "block", width: "100%", height: "auto", borderRadius: 12, border: "1px solid #E3E8E2", boxShadow: "0 4px 18px rgba(20,23,26,0.06)" }}
            />
            {hp && (
              <div
                className="chart-tooltip"
                style={{ position: "absolute", left: hover.cssX, top: hover.cssY, transform: "translate(-50%, calc(-100% - 14px))", pointerEvents: "none", whiteSpace: "nowrap", zIndex: 2 }}
              >
                <div className="chart-tooltip-name">{hp.player_name}</div>
                <div className="chart-tooltip-sub">{hp["Current Club"] || "–"} · {hp.tm_position || hp.position || "–"}</div>
                <div>{axisLabel(chart.xStat)}: <strong>{formatStat(chart.xStat, hp.x)}</strong></div>
                <div>{axisLabel(chart.yStat)}: <strong>{formatStat(chart.yStat, hp.y)}</strong></div>
              </div>
            )}
          </div>
          <p className="chart-note">
            {chart.points.length.toLocaleString("cs-CZ")} {hracuCs(chart.points.length)} v grafu. Přerušované zelené čáry = průměr hráčů v grafu{sameUnit(chart.xStat, chart.yStat) ? ", šedá diagonála = obě hodnoty stejné" : ""}. Klikni na bod pro otevření profilu.
          </p>
        </>
      )}
    </div>
  );
}
