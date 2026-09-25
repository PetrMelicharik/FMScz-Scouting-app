"use client";
import React, { useState, useRef } from "react";
import { flagUrl } from "../lib/countryFlags";
import { classifyMainSlot, POSITION_DOT } from "../lib/positionSlot";
import { CATEGORY_COLORS } from "../lib/pizzaShared";

const FOOT_LABELS = { right: "Pravá", left: "Levá", both: "Obě" };

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

const CARD_W = 900;
const FONT_BODY = "'Inter', -apple-system, sans-serif";
const FONT_HEAD = "'Baloo 2', -apple-system, sans-serif";

function ReportCard({ form, pizza }) {
  const nationalFlag = flagUrl(form.nationality);
  const slot = classifyMainSlot(form.positionLabel);
  const dot = slot ? POSITION_DOT[slot] : null;
  const hasPizza = pizza && !pizza.insufficient;

  const margin = 36;
  const colW = CARD_W - margin * 2;

  // Middle section: text (Profil / Scoutský report) on the left, stacked
  // stat cards on the right — same arrangement as the reference template.
  const textColW = Math.round(colW * 0.6);
  const statColW = colW - textColW - 24;
  const textCharWidth = 6.9; // approx. px per character for Inter at 13.5px
  const maxLineLen = Math.max(30, Math.floor((textColW - 36) / textCharWidth));

  const profileLines = wrapParagraph(form.profileText, maxLineLen);
  const scoutLines = wrapParagraph(form.scoutReportText, maxLineLen);

  const headerH = hasPizza ? 420 : 264;
  const infoCardsH = 62;
  const textLineH = 21;
  const textBoxPad = 40;
  const profileH = form.profileText ? textBoxPad + Math.max(1, profileLines.length) * textLineH : 0;
  const scoutH = form.scoutReportText ? textBoxPad + Math.max(1, scoutLines.length) * textLineH : 0;
  const statCardH = 76;
  const statGap = 12;
  const leftStackH = profileH + (profileH && scoutH ? 20 : 0) + scoutH;
  const rightStackH = statCardH * 3 + statGap * 2;
  const middleH = Math.max(leftStackH, rightStackH);
  const footerH = 54;
  const gap = 20;

  const totalH = 30 + headerH + gap + infoCardsH + gap + middleH + gap + footerH + 30;

  let y = 30;
  const headerY = y; y += headerH + gap;
  const infoY = y; y += infoCardsH + gap;
  const middleY = y; y += middleH + gap;
  const footerY = totalH - footerH - 20;

  const leftColW = 270;
  const pitchColW = 100;
  const pizzaColW = colW - leftColW - pitchColW - 40;

  return (
    <svg viewBox={`0 0 ${CARD_W} ${totalH}`} className="report-svg" style={{ background: "#FFFFFF", fontFamily: FONT_BODY }}>
      <rect x="0" y="0" width={CARD_W} height={totalH} fill="#FFFFFF" />

      {/* Header: photo/name/meta (col 1), pizza chart (col 2), pitch (col 3) */}
      <g transform={`translate(${margin}, ${headerY})`}>
        <clipPath id="report-photo-clip"><circle cx="55" cy="55" r="55" /></clipPath>
        {form.photoUrl ? (
          <>
            <circle cx="55" cy="55" r="57" fill="none" stroke="#E3E8E2" strokeWidth="2" />
            <image href={form.photoUrl} x="0" y="0" width="110" height="110" clipPath="url(#report-photo-clip)" preserveAspectRatio="xMidYMid slice" />
          </>
        ) : (
          <circle cx="55" cy="55" r="55" fill="#EFF6EE" stroke="#E3E8E2" strokeWidth="2" />
        )}
        <text x="0" y="130" fontFamily={FONT_HEAD} fontSize="26" fontWeight="700" fill="#14171A">{form.playerName || "Jméno hráče"}</text>
        <text x="0" y="152" fontSize="12" fill="#9AA39A">
          Report vytvořen: <tspan fontFamily={FONT_HEAD} fontWeight="700" fill="#4CB848">FM</tspan><tspan fontFamily={FONT_HEAD} fontWeight="700" fill="#14171A"> Scouts</tspan><tspan fontFamily={FONT_HEAD} fontWeight="700" fill="#9AA39A"> cz</tspan>
        </text>

        {form.dob && <text x="0" y="186" fontSize="12.5" fill="#667066">Datum narození: <tspan fontWeight="700" fill="#14171A">{form.dob}</tspan></text>}
        {nationalFlag && (
          <>
            <image href={nationalFlag} x="0" y="198" width="21" height="15" />
            <text x="27" y="210" fontSize="12.5" fill="#667066">{form.nationality}</text>
          </>
        )}
        {form.foot && <text x="0" y="238" fontSize="12.5" fill="#667066">Noha: <tspan fontWeight="700" fill="#14171A">{FOOT_LABELS[form.foot.toLowerCase()] || form.foot}</tspan></text>}
        {form.positionLabel && <text x="0" y="264" fontSize="12.5" fill="#667066">Pozice: <tspan fontWeight="700" fill="#14171A">{form.positionLabel}</tspan></text>}

        {hasPizza && (
          <g transform={`translate(${leftColW + 20}, 0)`}>
            <MiniPizza data={pizza} size={pizzaColW} />
          </g>
        )}

        {/* standalone pitch, right column */}
        <g transform={`translate(${leftColW + 20 + pizzaColW + 20}, 38)`}>
          <rect x="0" y="0" width={pitchColW} height="132" rx="8" fill="#2E8B45" stroke="#FFFFFF" strokeWidth="2" />
          <line x1="0" y1="66" x2={pitchColW} y2="66" stroke="#FFFFFF" strokeWidth="1" opacity="0.6" />
          <circle cx={pitchColW / 2} cy="66" r="14" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.6" />
          <path d={`M ${pitchColW / 2 - 13} 0 A 13 13 0 0 0 ${pitchColW / 2 + 13} 0`} fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.6" />
          <rect x={pitchColW / 2 - 26} y="105" width="52" height="27" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.6" />
          <rect x={pitchColW / 2 - 13} y="120" width="26" height="12" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.6" />
          {dot && <circle cx={(dot.left / 100) * pitchColW} cy={(dot.top / 100) * 132} r="7" fill="#4CB848" stroke="#FFFFFF" strokeWidth="2.5" />}
        </g>
      </g>

      {/* Info cards row */}
      <g transform={`translate(${margin}, ${infoY})`}>
        {[
          { label: form.league || "Liga", value: form.club || "Klub", logo: form.clubLogoUrl },
          { label: "Tržní hodnota", value: form.marketValue || "–" },
          { label: "Smlouva do", value: form.contractUntil || "–" },
        ].map((card, i) => {
          const cardW = (colW - 24) / 3;
          const x = i * (cardW + 12);
          return (
            <g key={i} transform={`translate(${x}, 0)`}>
              <rect x="0" y="0" width={cardW} height={infoCardsH} rx="9" fill="#F3FAF2" />
              {card.logo && <image href={card.logo} x="12" y="15" width="22" height="22" />}
              <text x={card.logo ? 42 : 14} y="24" fontSize="10" fill="#9AA39A">{card.label}</text>
              <text x={card.logo ? 42 : 14} y="43" fontSize="14" fontWeight="700" fill="#14171A">{card.value}</text>
            </g>
          );
        })}
      </g>

      {/* Middle section: text column (left) + stacked stat cards (right) */}
      <g transform={`translate(${margin}, ${middleY})`}>
        {/* Profil */}
        {profileH > 0 && (
          <g>
            <rect x="0" y="0" width={textColW} height={profileH} rx="12" fill="#FAFBFA" stroke="#E3E8E2" strokeWidth="1" />
            <text x="18" y="26" fontFamily={FONT_HEAD} fontSize="14" fontWeight="700" fill="#4CB848">Profil</text>
            {profileLines.map((line, i) => (
              <text key={i} x="18" y={26 + textLineH * (i + 1)} fontSize="13.5" fill="#14171A">{line}</text>
            ))}
          </g>
        )}
        {/* Scoutský report */}
        {scoutH > 0 && (
          <g transform={`translate(0, ${profileH ? profileH + 20 : 0})`}>
            <rect x="0" y="0" width={textColW} height={scoutH} rx="12" fill="#FAFBFA" stroke="#E3E8E2" strokeWidth="1" />
            <text x="18" y="26" fontFamily={FONT_HEAD} fontSize="14" fontWeight="700" fill="#4CB848">Scoutský report</text>
            {scoutLines.map((line, i) => (
              <text key={i} x="18" y={26 + textLineH * (i + 1)} fontSize="13.5" fill="#14171A">{line}</text>
            ))}
          </g>
        )}

        {/* Stacked stat cards */}
        <g transform={`translate(${textColW + 24}, 0)`}>
          {[
            { label: form.season ? `Sezóna ${form.season}` : "Sezóna", value: form.appearances ? `${form.appearances} zápasů` : "–" },
            { label: "Góly + asistence", value: `${form.goals || 0} + ${form.assists || 0}` },
            { label: form.externalRatingLabel || "Externí hodnocení", value: form.externalRatingValue || "–" },
          ].map((card, i) => (
            <g key={i} transform={`translate(0, ${i * (statCardH + statGap)})`}>
              <rect x="0" y="0" width={statColW} height={statCardH} rx="10" fill="#F3FAF2" />
              <text x="16" y="30" fontSize="11" fill="#9AA39A">{card.label}</text>
              <text x="16" y="56" fontSize="19" fontWeight="700" fill="#14171A">{card.value}</text>
            </g>
          ))}
        </g>
      </g>

      {/* Footer */}
      <line x1={margin} y1={footerY - 14} x2={CARD_W - margin} y2={footerY - 14} stroke="#E3E8E2" strokeWidth="1" />
      <text x={CARD_W / 2} y={footerY + 14} textAnchor="middle" fontFamily={FONT_HEAD} fontSize="13" fontWeight="700">
        <tspan fill="#4CB848">FM</tspan><tspan fill="#14171A"> Scouts</tspan><tspan fill="#9AA39A"> cz</tspan>
      </text>
    </svg>
  );
}

function MiniPizza({ data, size }) {
  const { stats } = data;
  const n = stats.length;
  const cx = size / 2;
  const titleH = 22;
  const cy = titleH + (size - titleH) / 2 + 4;
  const innerR = size * 0.095;
  const maxR = size * 0.32;
  const axisGapDeg = 16;
  const gapDeg = Math.min(3, (360 - axisGapDeg) / n / 5);
  const sliceDeg = (360 - axisGapDeg) / n;
  const sliceStart = axisGapDeg / 2;

  function polar(angleDeg, r) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }

  return (
    <g>
      <text x={cx} y="14" textAnchor="middle" fontFamily={FONT_HEAD} fontSize="12" fontWeight="700" fill="#14171A">
        {wrapLabel(`Srovnání (${data.groupLabel})`, 36)[0]}
      </text>
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
        const lines = wrapLabel(s.label.replace(/\/90$/, ""), 11);
        const [lx, ly] = polar(midAngle, maxR + 26);
        const flip = midAngle > 90 && midAngle < 270;
        const rot = flip ? midAngle + 180 : midAngle;
        const badgeW = Math.max(20, s.display.length * 5.2 + 8);
        return (
          <g key={s.key}>
            <path d={path} fill={color} fillOpacity="0.28" stroke={color} strokeWidth="1.25" />
            <g transform={`translate(${vx.toFixed(1)} ${vy.toFixed(1)})`}>
              <rect x={-badgeW / 2} y="-7" width={badgeW} height="14" rx="7" fill={color} />
              <text x="0" y="1" textAnchor="middle" dominantBaseline="middle" fontSize="7.5" fontWeight="700" fill="#FFFFFF">{s.display}</text>
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
    </g>
  );
}

/* ---------------------------------------------------------------------- */
/* Main builder — form + live preview + download                          */
/* ---------------------------------------------------------------------- */

export default function ReportBuilder({ player, pizza }) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
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
    externalRatingLabel: "Sofascore rating",
    externalRatingValue: "",
    profileText: "",
    scoutReportText: "",
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

      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        const link = document.createElement("a");
        const safeName = (form.playerName || "report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        link.download = `fmscouts-report-${safeName}.png`;
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
    <div className="profile-group">
      <button type="button" className="btn-accent" onClick={() => setOpen((o) => !o)}>
        {open ? "Zavřít tvorbu reportu" : "Vytvořit report"}
      </button>

      {open && (
        <div className="report-builder">
          <div className="report-form">
            <div className="report-form-title">Údaje reportu</div>

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
              <div className="field-label">Sezóna</div>
              <input type="text" value={form.season} onChange={(e) => set("season", e.target.value)} />
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
              <div className="field-label">Externí hodnocení — popisek</div>
              <input type="text" value={form.externalRatingLabel} onChange={(e) => set("externalRatingLabel", e.target.value)} placeholder="např. Sofascore rating" />
            </div>
            <div className="field">
              <div className="field-label">Externí hodnocení — hodnota</div>
              <input type="text" value={form.externalRatingValue} onChange={(e) => set("externalRatingValue", e.target.value)} placeholder="např. 7,24" />
            </div>

            <div className="field">
              <div className="field-label">Profil (text)</div>
              <textarea rows={5} value={form.profileText} onChange={(e) => set("profileText", e.target.value)} placeholder="Krátký popis hráče…" />
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
            <ReportCard form={form} pizza={pizza} />
          </div>
        </div>
      )}
    </div>
  );
}
