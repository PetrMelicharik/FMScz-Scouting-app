"use client";
import React, { useState, useRef } from "react";
import { flagUrl } from "../lib/countryFlags";
import { classifyMainSlot, POSITION_DOT } from "../lib/positionSlot";
import { CATEGORY_COLORS } from "../lib/pizzaShared";
import { formatStat, STAT_LABELS_EN } from "../lib/statMeta";

/* ---------------------------------------------------------------------- */
/* Report language — every string that ends up ON the report card must go */
/* through this dictionary so "Vytvořit report v angličtině" really means  */
/* the whole exported image, including chart labels/captions.              */
/* ---------------------------------------------------------------------- */

const REPORT_TEXT = {
  cs: {
    foot: { right: "Pravá", left: "Levá", both: "Obě" },
    dob: "Datum narození",
    nationality: "Národnost",
    footLabel: "Noha",
    leagueFallback: "Liga",
    clubFallback: "Klub",
    marketValue: "Hodnota hráče",
    contractUntil: "Smlouva do",
    appearances: "Počet zápasů",
    goalsAssists: "Góly + asistence",
    avgRating: "Průměrné hodnocení",
    scoutReport: "Scoutský report",
    playerNamePlaceholder: "Jméno hráče",
    formTitle: (n) => `Forma (posledních ${n} zápasů)`,
    pizzaCaption: (poolSize, league) =>
      `Percentil vůči ${poolSize.toLocaleString("cs-CZ")} hráčům se stejnou pozicí v lize ${league} (statistiky na 90 minut), min. 300 odehraných minut.`,
    numberLocale: "cs-CZ",
  },
  en: {
    foot: { right: "Right", left: "Left", both: "Both" },
    dob: "Date of birth",
    nationality: "Nationality",
    footLabel: "Foot",
    leagueFallback: "League",
    clubFallback: "Club",
    marketValue: "Market value",
    contractUntil: "Contract until",
    appearances: "Appearances",
    goalsAssists: "Goals + assists",
    avgRating: "Average rating",
    scoutReport: "Scout report",
    playerNamePlaceholder: "Player name",
    formTitle: (n) => `Form (last ${n} matches)`,
    pizzaCaption: (poolSize, league) =>
      `Percentile vs. ${poolSize.toLocaleString("en-US")} players in the same position in ${league} (stats per 90 minutes), min. 300 minutes played.`,
    numberLocale: "en-US",
  },
};

function formatBirthday(raw) {
  if (!raw) return "";
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(raw);
  if (!m) return raw;
  const [, y, mo, d] = m;
  return `${d}.${mo}.${y}`;
}

function wrapParagraph(text, maxLen) {
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (let w of words) {
    // A single "word" longer than the whole line (e.g. no spaces at all,
    // or a long URL) has to be hard-broken — otherwise it never wraps.
    while (w.length > maxLen) {
      if (current) { lines.push(current); current = ""; }
      lines.push(w.slice(0, maxLen));
      w = w.slice(maxLen);
    }
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length > maxLen && current) {
      lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function wrapLabel(label, maxLen = 11) {
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

async function toDataURI(url) {
  if (!url || url.startsWith("data:")) return url;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function readFileAsDataURI(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------------------------------------------------------------------- */
/* Report card — one big self-contained SVG, height grows with the text    */
/* ---------------------------------------------------------------------- */

// Landscape-ish width/height ratio on purpose: X/Twitter applies much more
// aggressive cropping/re-compression to tall "portrait" images (the old
// 900px-wide card routinely came out ~1050-1100px tall) which is what made
// text in the uploaded report look blurry/artifacted after it was posted.
// A wide, shorter card (roughly 2:1-ish, depending on how much scout-report
// text is typed in) stays inside the aspect-ratio range X handles best.
const CARD_W = 1180;
const FONT_BODY = "'Inter', -apple-system, sans-serif";
const FONT_HEAD = "'Baloo 2', -apple-system, sans-serif";

function formColor(r) {
  return r >= 7 ? "#4CB848" : r >= 6 ? "#D97706" : "#DC2626";
}

function formatShortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

function FormChart({ ratings, dates, width, height, t }) {
  const padX = 20;
  const padTop = 20;
  const padBottom = 16;
  const domainMin = 4, domainMax = 9;
  const plotH = height - padTop - padBottom;
  const n = ratings.length;
  const stepX = n > 1 ? (width - padX * 2) / (n - 1) : 0;
  const baseY = padTop + plotH;

  const points = ratings.map((r, i) => {
    const x = padX + stepX * i;
    const clamped = Math.max(domainMin, Math.min(domainMax, r));
    const y = padTop + plotH - ((clamped - domainMin) / (domainMax - domainMin)) * plotH;
    return { x, y, r, date: dates?.[i] };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaPath = points.length > 1
    ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${baseY} L ${points[0].x.toFixed(1)} ${baseY} Z`
    : "";

  return (
    <g>
      <text x="0" y="12" fontFamily={FONT_HEAD} fontSize="12" fontWeight="700" fill="#14171A">{t.formTitle(ratings.length)}</text>
      <g transform="translate(0, 10)">
        {areaPath && <path d={areaPath} fill="#4CB848" fillOpacity="0.14" stroke="none" />}
        <path d={linePath} fill="none" stroke="#4CB848" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4.5" fill={formColor(p.r)} stroke="#FFFFFF" strokeWidth="1.5" />
            <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#14171A">{p.r.toFixed(1)}</text>
            <text x={p.x} y={height - 2} textAnchor="middle" fontSize="9" fill="#667066">{p.date || ""}</text>
          </g>
        ))}
      </g>
    </g>
  );
}

function TileRow({ items, colW, cardH }) {
  const cardW = (colW - 24) / 3;
  return (
    <>
      {items.map((card, i) => (
        <g key={i} transform={`translate(${i * (cardW + 12)}, 0)`}>
          <rect x="0" y="0" width={cardW} height={cardH} rx="9" fill="rgba(255,255,255,0.6)" />
          {card.logo && <image href={card.logo} x="12" y="15" width="22" height="22" />}
          {!card.logo && card.emoji && <text x="12" y="35" fontSize="19">{card.emoji}</text>}
          <text x={card.logo || card.emoji ? 42 : 14} y="24" fontSize="10" fill="#7C8894">{card.label}</text>
          <text x={card.logo || card.emoji ? 42 : 14} y="43" fontSize="14" fontWeight="700" fill="#14171A">{card.value}</text>
        </g>
      ))}
    </>
  );
}

function ReportCard({ form, pizza, player, lang }) {
  const t = REPORT_TEXT[lang] || REPORT_TEXT.cs;
  const nationalFlag = flagUrl(form.nationality);
  const slot = classifyMainSlot(form.positionLabel);
  const dot = slot ? POSITION_DOT[slot] : null;
  const hasPizza = pizza && !pizza.insufficient;
  const filledFormRows = (form.formRatings || []).filter((r) => r.rating !== "" && !Number.isNaN(Number(r.rating)));
  const hasForm = filledFormRows.length > 0;

  const margin = 36;
  const colW = CARD_W - margin * 2;
  const gap = 20;

  // Header = three columns side by side instead of the old stack of rows:
  // 1) photo/name/pitch, 2) stat tiles (3x3 grid) + form chart, 3) pizza
  // chart. Spreading these across the width (instead of down the page) is
  // what keeps the whole card from becoming a tall portrait image.
  const col1W = 300;
  const col3W = 340;
  const col2W = colW - col1W - col3W - gap * 2;

  const identityH = 92;
  const pitchW = 140;
  const pitchH = 172;
  const col1H = identityH + 14 + pitchH;

  const tileRowH = 54;
  const tileGap = 10;
  const gridH = tileRowH * 3 + tileGap * 2;
  const formChartH = 108;
  const col2H = gridH + (hasForm ? 16 + formChartH : 0);

  const pizzaSize = Math.min(col3W, 300);
  const pizzaCaptionH = 40;
  const col3H = hasPizza ? pizzaSize + 10 + pizzaCaptionH : 0;

  const headerH = Math.max(col1H, col2H, col3H);

  // Scout report: spans the full card width (matching the header row
  // above it). A short note stays one column; a longer write-up flows into
  // two columns, newspaper-style, with a vertical rule down the middle so
  // it visually reads as two columns rather than looking like one overly
  // wide, off-balance block.
  const scoutColW = colW;
  const textCharWidth = 6.9; // approx. px per character for Inter at 13.5px
  const textLineH = 22;
  const textBoxPad = 44;
  const scoutPadX = 24;
  const scoutColGap = 44;
  // Whether to split into two columns is decided from the raw character
  // count, not from lines wrapped at full width — a long text wrapped that
  // wide would only ever produce a handful of (way too long) lines, which
  // would never trip a "line count" threshold.
  const useTwoCols = (form.scoutReportText || "").length > 480;

  let scoutLines = [];
  let scoutCol2Lines = [];
  let scoutColInnerW = scoutColW - scoutPadX * 2;
  if (!useTwoCols) {
    const fullMaxLen = Math.max(30, Math.floor(scoutColInnerW / textCharWidth));
    scoutLines = wrapParagraph(form.scoutReportText, fullMaxLen);
  } else {
    scoutColInnerW = (scoutColW - scoutPadX * 2 - scoutColGap) / 2;
    const wideMaxLen = Math.max(30, Math.floor(scoutColInnerW / textCharWidth));
    const allLines = wrapParagraph(form.scoutReportText, wideMaxLen);
    const perCol = Math.ceil(allLines.length / 2);
    scoutLines = allLines.slice(0, perCol);
    scoutCol2Lines = allLines.slice(perCol);
  }
  const scoutLineCount = Math.max(scoutLines.length, scoutCol2Lines.length);
  const scoutH = form.scoutReportText ? textBoxPad + Math.max(1, scoutLineCount) * textLineH : 0;

  const footerH = 54;

  const totalH = 30 + headerH + (scoutH > 0 ? gap + scoutH : 0) + gap + footerH + 30;

  let y = 30;
  const headerY = y; y += headerH + gap;
  const scoutY = y; if (scoutH > 0) y += scoutH + gap;
  const footerY = totalH - footerH - 20;

  return (
    <svg viewBox={`0 0 ${CARD_W} ${totalH}`} className="report-svg" style={{ background: "#EAF3FB", fontFamily: FONT_BODY }}>
      <rect x="0" y="0" width={CARD_W} height={totalH} fill="#EAF3FB" />
      <image href="/logo.jpg" x={CARD_W / 2 - 260} y={Math.max(0, totalH / 2 - 260)} width="520" height="520" opacity="0.055" />

      <g transform={`translate(${margin}, ${headerY})`}>
        {/* Column 1: photo, name, position, mini pitch */}
        <g>
          <clipPath id="report-photo-clip"><circle cx="46" cy="46" r="46" /></clipPath>
          {form.photoUrl ? (
            <>
              <circle cx="46" cy="46" r="48" fill="none" stroke="#FFFFFF" strokeWidth="3" />
              <image href={form.photoUrl} x="0" y="0" width="92" height="92" clipPath="url(#report-photo-clip)" preserveAspectRatio="xMidYMid slice" />
            </>
          ) : (
            <circle cx="46" cy="46" r="46" fill="#F3FAF2" stroke="#FFFFFF" strokeWidth="3" />
          )}
          <text x="104" y="40" fontFamily={FONT_HEAD} fontSize="24" fontWeight="700" fill="#14171A">{form.playerName || t.playerNamePlaceholder}</text>
          <text x="104" y="64" fontSize="15" fontWeight="600" fill="#4A5A68">{form.positionLabel}</text>

          <g transform={`translate(${(col1W - pitchW) / 2}, ${identityH + 14})`}>
            <rect x="0" y="0" width={pitchW} height={pitchH} rx="10" fill="#2E8B45" stroke="#FFFFFF" strokeWidth="2.5" />
            <line x1="0" y1={pitchH / 2} x2={pitchW} y2={pitchH / 2} stroke="#FFFFFF" strokeWidth="1" opacity="0.6" />
            <circle cx={pitchW / 2} cy={pitchH / 2} r="18" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.6" />
            <path d={`M ${pitchW / 2 - 17} 0 A 17 17 0 0 0 ${pitchW / 2 + 17} 0`} fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.6" />
            <rect x={pitchW / 2 - 34} y={pitchH - 36} width="68" height="36" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.6" />
            <rect x={pitchW / 2 - 17} y={pitchH - 16} width="34" height="16" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.6" />
            {dot && <circle cx={(dot.left / 100) * pitchW} cy={(dot.top / 100) * pitchH} r="8" fill="#F97316" stroke="#FFFFFF" strokeWidth="2.5" />}
          </g>
        </g>

        {/* Column 2: stat tiles (3x3 grid) + form chart */}
        <g transform={`translate(${col1W + gap}, 0)`}>
          <TileRow
            colW={col2W}
            cardH={tileRowH}
            items={[
              { label: t.dob, value: form.dob || "–", emoji: "🎂" },
              { label: t.nationality, value: form.nationality || "–", logo: nationalFlag },
              { label: t.footLabel, value: form.foot ? (t.foot[form.foot.toLowerCase()] || form.foot) : "–", emoji: "🦶" },
            ]}
          />
          <g transform={`translate(0, ${tileRowH + tileGap})`}>
            <TileRow
              colW={col2W}
              cardH={tileRowH}
              items={[
                { label: form.league || t.leagueFallback, value: form.club || t.clubFallback, logo: form.clubLogoUrl },
                { label: t.marketValue, value: form.marketValue || "–", emoji: "💰" },
                { label: t.contractUntil, value: form.contractUntil || "–", emoji: "📝" },
              ]}
            />
          </g>
          <g transform={`translate(0, ${(tileRowH + tileGap) * 2})`}>
            <TileRow
              colW={col2W}
              cardH={tileRowH}
              items={[
                { label: t.appearances, value: form.appearances || "–", emoji: "🎽" },
                { label: t.goalsAssists, value: `${form.goals || 0} + ${form.assists || 0}`, emoji: "⚽" },
                { label: t.avgRating, value: form.avgRating || "–", emoji: "⭐" },
              ]}
            />
          </g>
          {hasForm && (
            <g transform={`translate(0, ${gridH + 16})`}>
              <FormChart ratings={filledFormRows.map((r) => Number(r.rating))} dates={filledFormRows.map((r) => r.date)} width={col2W} height={formChartH} t={t} />
            </g>
          )}
        </g>

        {/* Column 3: pizza chart */}
        {hasPizza && (
          <g transform={`translate(${col1W + gap + col2W + gap}, 0)`}>
            <MiniPizza
              data={pizza} size={pizzaSize}
              caption={t.pizzaCaption(pizza.poolSize, form.league)}
              lang={lang}
            />
          </g>
        )}
      </g>

      {/* Scout report */}
      {scoutH > 0 && (
        <g transform={`translate(${margin}, ${scoutY})`}>
          <rect x="0" y="0" width={scoutColW} height={scoutH} rx="12" fill="rgba(255,255,255,0.65)" stroke="#D7E4F0" strokeWidth="1" />
          <text x={scoutPadX} y="30" fontFamily={FONT_HEAD} fontSize="14" fontWeight="700" fill="#4CB848">{t.scoutReport}</text>
          {useTwoCols && (
            <line
              x1={scoutPadX + scoutColInnerW + scoutColGap / 2} y1="24"
              x2={scoutPadX + scoutColInnerW + scoutColGap / 2} y2={scoutH - 18}
              stroke="#AFC2CC" strokeWidth="2"
            />
          )}
          {scoutLines.map((line, i) => (
            <text key={i} x={scoutPadX} y={30 + textLineH * (i + 1)} fontSize="13.5" fill="#14171A">{line}</text>
          ))}
          {useTwoCols && scoutCol2Lines.map((line, i) => (
            <text key={i} x={scoutPadX + scoutColInnerW + scoutColGap} y={30 + textLineH * (i + 1)} fontSize="13.5" fill="#14171A">{line}</text>
          ))}
        </g>
      )}

      {/* Footer */}
      <line x1={margin} y1={footerY - 14} x2={CARD_W - margin} y2={footerY - 14} stroke="#D7E4F0" strokeWidth="1" />
      <text x={CARD_W / 2} y={footerY + 14} textAnchor="middle" fontFamily={FONT_HEAD} fontSize="13" fontWeight="700">
        <tspan fill="#4CB848">FM</tspan><tspan fill="#14171A"> Scouts</tspan><tspan fill="#8A96A3"> cz</tspan>
      </text>
    </svg>
  );
}

function MiniPizza({ data, size, caption, lang }) {
  const { stats } = data;
  const n = stats.length;
  const cx = size / 2;
  const cy = size / 2;
  const innerR = size * 0.095;
  const maxR = size * 0.34;
  const axisGapDeg = 16;
  const gapDeg = Math.min(3, (360 - axisGapDeg) / n / 5);
  const sliceDeg = (360 - axisGapDeg) / n;
  const sliceStart = axisGapDeg / 2;
  const captionLines = wrapParagraph(caption || "", Math.max(20, Math.floor(size / 6.2)));

  function polar(angleDeg, r) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }

  return (
    <g>
      {[20, 40, 60, 80, 100].map((pct) => (
        <g key={pct}>
          <circle cx={cx} cy={cy} r={innerR + (pct / 100) * (maxR - innerR)} fill="none" stroke="#E3E8E2" strokeWidth="1" strokeDasharray="2 3" />
          <text x={cx} y={cy - (innerR + (pct / 100) * (maxR - innerR)) - 2} textAnchor="middle" fontSize="6.5" fill="#9AA39A">{pct}</text>
        </g>
      ))}
      {stats.map((s, i) => {
        const a0 = sliceStart + i * sliceDeg + gapDeg / 2;
        const a1 = sliceStart + (i + 1) * sliceDeg - gapDeg / 2;
        const r = innerR + (Math.max(2, s.percentile) / 100) * (maxR - innerR);
        const color = CATEGORY_COLORS[s.category];
        const [x0i, y0i] = polar(a0, innerR);
        const [x0o, y0o] = polar(a0, r);
        const [x1o, y1o] = polar(a1, r);
        const [x1i, y1i] = polar(a1, innerR);
        const largeArc = a1 - a0 > 180 ? 1 : 0;
        const path = `M ${x0i.toFixed(1)} ${y0i.toFixed(1)} L ${x0o.toFixed(1)} ${y0o.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 ${largeArc} 1 ${x1o.toFixed(1)} ${y1o.toFixed(1)} L ${x1i.toFixed(1)} ${y1i.toFixed(1)} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x0i.toFixed(1)} ${y0i.toFixed(1)} Z`;
        const midAngle = (a0 + a1) / 2;
        const valueR = Math.max(r, innerR + 14);
        const [vx, vy] = polar(midAngle, valueR + 3);
        const label = lang === "en" ? (STAT_LABELS_EN[s.key] || s.label) : s.label;
        const display = lang === "en" ? formatStat(s.key, s.value, "en-US") : s.display;
        const lines = wrapLabel(label.replace(/\/90$/, ""), 11);
        const [lx, ly] = polar(midAngle, maxR + 26);
        const flip = midAngle > 90 && midAngle < 270;
        const rot = flip ? midAngle + 180 : midAngle;
        const badgeW = Math.max(20, display.length * 5.2 + 8);
        return (
          <g key={s.key}>
            <path d={path} fill={color} fillOpacity="0.28" stroke={color} strokeWidth="1.25" />
            <g transform={`translate(${vx.toFixed(1)} ${vy.toFixed(1)})`}>
              <rect x={-badgeW / 2} y="-7" width={badgeW} height="14" rx="7" fill={color} />
              <text x="0" y="1" textAnchor="middle" dominantBaseline="middle" fontSize="7.5" fontWeight="700" fill="#FFFFFF">{display}</text>
            </g>
            <g transform={`translate(${lx.toFixed(1)} ${ly.toFixed(1)}) rotate(${rot.toFixed(1)})`}>
              {lines.map((line, li) => (
                <text key={li} x={0} y={(li - (lines.length - 1) / 2) * 9} textAnchor="middle" fontSize="7.5" fontWeight="600" fill="#44514A">{line}</text>
              ))}
            </g>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={innerR - 3} fill="#FFFFFF" stroke="#E3E8E2" strokeWidth="1.5" />
      {captionLines.length > 0 && (
        <g transform={`translate(${cx}, ${size + 16})`}>
          {captionLines.map((line, i) => (
            <text key={i} x="0" y={i * 13} textAnchor="middle" fontSize="10" fill="#667066">{line}</text>
          ))}
        </g>
      )}
    </g>
  );
}

function buildInitialFormRatings(player) {
  const ratings = player.form_ratings ? [...player.form_ratings].reverse() : [];
  const dates = player.form_dates ? [...player.form_dates].reverse() : [];
  const rows = [];
  for (let i = 0; i < 6; i++) {
    rows.push({
      date: dates[i] ? formatShortDate(dates[i]) : "",
      rating: ratings[i] != null ? String(ratings[i]) : "",
    });
  }
  return rows;
}

/* ---------------------------------------------------------------------- */
/* Main builder — form + live preview + download                          */
/* ---------------------------------------------------------------------- */

export default function ReportBuilder({ player, pizza }) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [lang, setLang] = useState("cs");
  const previewRef = useRef(null);

  const [form, setForm] = useState({
    photoUrl: player.photo_url || "",
    playerName: player.player_name || "",
    dob: formatBirthday(player.birthday),
    nationality: player.nationality || "",
    foot: player.foot || "",
    positionLabel: player.tm_position || player.position || "",
    club: player["Current Club"] || "",
    clubLogoUrl: player.club_logo_url || "",
    league: player.league_name || "",
    leagueLogoUrl: player.league_logo_url || "",
    marketValue: player.market_value || "",
    contractUntil: player.contract_until || "",
    season: player.season || "",
    appearances: player.appearances != null ? String(player.appearances) : "",
    goals: player.goals != null ? String(player.goals) : "",
    assists: player.assists != null ? String(player.assists) : "",
    avgRating: player.avg_rating_ != null ? formatStat("avg_rating_", player.avg_rating_) : "",
    scoutReportText: "",
    formRatings: buildInitialFormRatings(player),
  });

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleImageUpload(field, file) {
    if (!file) return;
    const dataUri = await readFileAsDataURI(file);
    set(field, dataUri);
  }

  async function handleDownload() {
    if (!previewRef.current) return;
    setDownloading(true);
    try {
      const svgEl = previewRef.current.querySelector("svg");
      if (!svgEl) return;
      const clone = svgEl.cloneNode(true);
      const images = clone.querySelectorAll("image");
      for (const imgEl of images) {
        const href = imgEl.getAttribute("href");
        const dataUri = await toDataURI(href);
        if (dataUri) imgEl.setAttribute("href", dataUri);
        else imgEl.remove();
      }

      const [, , width, height] = clone.getAttribute("viewBox").split(" ").map(Number);
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", width);
      clone.setAttribute("height", height);

      const svgString = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });

      // Exported at 3x the template size (≈2700px wide) rather than 2x —
      // social platforms like X re-compress uploaded images, and small text
      // (stat labels, pizza-chart numbers) needs the extra source resolution
      // to survive that compression legibly. The <img> src is an SVG blob,
      // so Chromium rasterizes it at whatever size drawImage requests here
      // (not a fixed low-res bitmap that then just gets stretched), which is
      // what actually makes the higher scale produce genuinely sharper output.
      const scale = 3;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
      ctx.scale(scale, scale);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        const link = document.createElement("a");
        const safeName = (form.playerName || "report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        const langSuffix = lang === "en" ? "-en" : "";
        link.download = `fmscouts-report-${safeName}${langSuffix}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
      });
    } catch (e) {
      console.error(e);
      alert("Stažení se nepovedlo — zkus to prosím znovu. Pokud problém přetrvá, zkus u fotky/loga nahrát soubor místo URL adresy.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <button type="button" className="btn-accent report-action-btn" onClick={() => setOpen((o) => !o)}>
        {open ? "Zavřít tvorbu reportu" : "Vytvořit report"}
      </button>

      {open && (
        <div className="report-builder report-action-panel">
          <div className="report-form">
            <div className="report-form-title">Údaje reportu</div>

            <div className="field">
              <div className="field-label">Jazyk reportu</div>
              <div className="chip-row">
                <button type="button" className={`chip${lang === "cs" ? " active" : ""}`} onClick={() => setLang("cs")}>🇨🇿 Čeština</button>
                <button type="button" className={`chip${lang === "en" ? " active" : ""}`} onClick={() => setLang("en")}>🇬🇧 English</button>
              </div>
            </div>

            <div className="field">
              <div className="field-label">Fotka hráče</div>
              <input type="text" value={form.photoUrl} onChange={(e) => set("photoUrl", e.target.value)} placeholder="URL adresa fotky" />
              <input type="file" accept="image/*" onChange={(e) => handleImageUpload("photoUrl", e.target.files?.[0])} />
            </div>

            <div className="field">
              <div className="field-label">Jméno hráče</div>
              <input type="text" value={form.playerName} onChange={(e) => set("playerName", e.target.value)} />
            </div>

            <div className="field">
              <div className="field-label">Datum narození</div>
              <input type="text" value={form.dob} onChange={(e) => set("dob", e.target.value)} placeholder="např. 12.05.2004" />
            </div>

            <div className="field">
              <div className="field-label">Národnost</div>
              <input type="text" value={form.nationality} onChange={(e) => set("nationality", e.target.value)} />
            </div>

            <div className="field">
              <div className="field-label">Preferovaná noha</div>
              <select value={form.foot} onChange={(e) => set("foot", e.target.value)}>
                <option value="">–</option>
                <option value="right">Pravá</option>
                <option value="left">Levá</option>
                <option value="both">Obě</option>
              </select>
            </div>

            <div className="field">
              <div className="field-label">Pozice</div>
              <input type="text" value={form.positionLabel} onChange={(e) => set("positionLabel", e.target.value)} />
            </div>

            <div className="field">
              <div className="field-label">Klub</div>
              <input type="text" value={form.club} onChange={(e) => set("club", e.target.value)} />
              <input type="text" value={form.clubLogoUrl} onChange={(e) => set("clubLogoUrl", e.target.value)} placeholder="URL loga klubu" />
              <input type="file" accept="image/*" onChange={(e) => handleImageUpload("clubLogoUrl", e.target.files?.[0])} />
            </div>

            <div className="field">
              <div className="field-label">Liga</div>
              <input type="text" value={form.league} onChange={(e) => set("league", e.target.value)} />
            </div>

            <div className="field">
              <div className="field-label">Tržní hodnota</div>
              <input type="text" value={form.marketValue} onChange={(e) => set("marketValue", e.target.value)} />
            </div>

            <div className="field">
              <div className="field-label">Smlouva do</div>
              <input type="text" value={form.contractUntil} onChange={(e) => set("contractUntil", e.target.value)} />
            </div>

            <div className="field">
              <div className="field-label">Zápasy</div>
              <input type="text" value={form.appearances} onChange={(e) => set("appearances", e.target.value)} />
            </div>

            <div className="field">
              <div className="field-label">Góly</div>
              <input type="text" value={form.goals} onChange={(e) => set("goals", e.target.value)} />
            </div>

            <div className="field">
              <div className="field-label">Asistence</div>
              <input type="text" value={form.assists} onChange={(e) => set("assists", e.target.value)} />
            </div>

            <div className="field">
              <div className="field-label">Průměrné hodnocení</div>
              <input type="text" value={form.avgRating} onChange={(e) => set("avgRating", e.target.value)} />
            </div>

            <div className="field">
              <div className="field-label">Forma (posledních 6 zápasů)</div>
              {form.formRatings.map((row, i) => (
                <div key={i} className="report-form-row">
                  <input
                    type="text" placeholder="datum, např. 23.8."
                    value={row.date}
                    onChange={(e) => {
                      const next = [...form.formRatings];
                      next[i] = { ...next[i], date: e.target.value };
                      set("formRatings", next);
                    }}
                  />
                  <input
                    type="text" placeholder="rating, např. 7.3"
                    value={row.rating}
                    onChange={(e) => {
                      const next = [...form.formRatings];
                      next[i] = { ...next[i], rating: e.target.value };
                      set("formRatings", next);
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="field">
              <div className="field-label">Scoutský report (text)</div>
              <textarea rows={7} value={form.scoutReportText} onChange={(e) => set("scoutReportText", e.target.value)} placeholder="Tvoje hodnocení hráče…" />
            </div>

            <button type="button" className="btn-accent" onClick={handleDownload} disabled={downloading}>
              {downloading ? "Připravuji…" : "⬇ Stáhnout jako obrázek"}
            </button>
          </div>

          <div className="report-preview" ref={previewRef}>
            <ReportCard form={form} pizza={pizza} player={player} lang={lang} />
          </div>
        </div>
      )}
    </>
  );
}
