import BackButton from "../../../components/BackButton";
import { notFound } from "next/navigation";
import Avatar from "../../../components/Avatar";
import PitchIcon from "../../../components/PitchIcon";
import { STAT_GROUPS, STAT_LABELS, formatStat } from "../../../lib/statMeta";
import { flagUrl } from "../../../lib/countryFlags";
import { loadPlayerById } from "../../../lib/playersData";
import { computePizzaData, CATEGORY_COLORS, CATEGORY_LABELS } from "../../../lib/pizzaData";

const FOOT_LABELS = { right: "Pravá", left: "Levá", both: "Obě" };

function formatShortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

function formColor(r) {
  return r >= 7 ? "#4CB848" : r >= 6 ? "#D97706" : "#DC2626";
}

function FormLineChart({ ratings, dates }) {
  const w = 480;
  const h = 100;
  const padX = 22;
  const padTop = 22;
  const padBottom = 18;
  const domainMin = 4, domainMax = 9;
  const plotH = h - padTop - padBottom;
  const n = ratings.length;
  const stepX = n > 1 ? (w - padX * 2) / (n - 1) : 0;
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
    <svg viewBox={`0 0 ${w} ${h}`} className="form-line-svg">
      <defs>
        <linearGradient id="formAreaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4CB848" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#4CB848" stopOpacity="0" />
        </linearGradient>
      </defs>
      {areaPath && <path d={areaPath} fill="url(#formAreaGradient)" stroke="none" />}
      <path d={linePath} fill="none" stroke="#4CB848" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="5" fill={formColor(p.r)} stroke="#FFFFFF" strokeWidth="1.5" />
          <text x={p.x} y={p.y - 11} textAnchor="middle" fontSize="12" fontWeight="700" fill="#14171A">{p.r.toFixed(1)}</text>
          <text x={p.x} y={h - 3} textAnchor="middle" fontSize="10" fill="#667066">{formatShortDate(p.date)}</text>
        </g>
      ))}
    </svg>
  );
}

function PizzaChart({ data }) {
  const { stats } = data;
  const n = stats.length;
  const size = 640;
  const cx = size / 2;
  const cy = size / 2;
  const innerR = 58;
  const maxR = 225;
  const gapDeg = Math.min(2, 360 / n / 6);
  const sliceDeg = 360 / n;

  function polar(angleDeg, r) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="pizza-svg">
      {[20, 40, 60, 80, 100].map((pct) => (
        <circle key={pct} cx={cx} cy={cy} r={innerR + (pct / 100) * (maxR - innerR)} fill="none" stroke="#E3E8E2" strokeWidth="1" />
      ))}
      {stats.map((s, i) => {
        const a0 = i * sliceDeg + gapDeg / 2;
        const a1 = (i + 1) * sliceDeg - gapDeg / 2;
        const r = innerR + (Math.max(2, s.percentile) / 100) * (maxR - innerR);
        const [x0i, y0i] = polar(a0, innerR);
        const [x0o, y0o] = polar(a0, r);
        const [x1o, y1o] = polar(a1, r);
        const [x1i, y1i] = polar(a1, innerR);
        const largeArc = a1 - a0 > 180 ? 1 : 0;
        const path = `M ${x0i.toFixed(1)} ${y0i.toFixed(1)} L ${x0o.toFixed(1)} ${y0o.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 ${largeArc} 1 ${x1o.toFixed(1)} ${y1o.toFixed(1)} L ${x1i.toFixed(1)} ${y1i.toFixed(1)} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x0i.toFixed(1)} ${y0i.toFixed(1)} Z`;

        const midAngle = (a0 + a1) / 2;
        const valueR = Math.max(r, innerR + 34);
        const [vx, vy] = polar(midAngle, valueR);
        const [lx, ly] = polar(midAngle, maxR + 26);
        const flip = midAngle > 90 && midAngle < 270;
        const labelRot = flip ? midAngle + 180 : midAngle;

        return (
          <g key={s.key} className="pizza-slice">
            <path d={path} fill={CATEGORY_COLORS[s.category]} fillOpacity="0.82" stroke="#FFFFFF" strokeWidth="1.5">
              <title>{`${s.label}: ${s.display} (${s.percentile}. percentil, n=${s.sampleSize})`}</title>
            </path>
            <text x={vx} y={vy} textAnchor="middle" fontSize="13" fontWeight="800" fill="#14171A" style={{ pointerEvents: "none" }}>
              {s.display}
            </text>
            <text
              x={lx} y={ly} textAnchor="middle" fontSize="11" fill="#44514A"
              transform={`rotate(${labelRot.toFixed(1)} ${lx.toFixed(1)} ${ly.toFixed(1)})`}
              style={{ pointerEvents: "none" }}
            >
              {s.label}
            </text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={innerR - 6} fill="#FFFFFF" stroke="#E3E8E2" strokeWidth="1.5" />
    </svg>
  );
}

export default function PlayerPage({ params }) {
  const p = loadPlayerById(params.id);
  if (!p) return notFound();
  const pizza = computePizzaData(p);

  return (
    <div className="profile">
      <BackButton />

      <div className="profile-header">
        <Avatar src={p.photo_url} size={72} className="profile-avatar" />
        <div>
          <h1 className="profile-name">{p.player_name}</h1>
          {flagUrl(p.nationality) && (
            <div className="profile-meta-line">
              <img src={flagUrl(p.nationality)} alt="" className="flag-mini" />
              {p.nationality}
            </div>
          )}
          {(p.tm_position || p.position) && (
            <div className="profile-meta-line">
              <PitchIcon className="position-icon-mini" />
              {p.tm_position || p.position}
            </div>
          )}
          <div className="profile-meta-line">
            {p.club_logo_url && <img src={p.club_logo_url} alt="" className="club-logo-mini" />}
            {p["Current Club"] || "–"}
          </div>
          <div className="profile-meta-line">
            {p.league_logo_url && <img src={p.league_logo_url} alt="" className="league-logo-mini" />}
            {[p.league_name, p.season].filter(Boolean).join(" ")}
          </div>
        </div>
      </div>

      {pizza && (
        <div className="profile-group">
          <div className="profile-group-title">
            Srovnání se skupinou hráčů ({pizza.groupLabel}) — {p.league_name}
          </div>
          <div className="pizza-panel">
            <PizzaChart data={pizza} />
          </div>
          <div className="pizza-legend">
            {[...new Set(pizza.stats.map((s) => s.category))].map((cat) => (
              <div key={cat} className="pizza-legend-item">
                <span className="legend-dot" style={{ background: CATEGORY_COLORS[cat] }}></span>
                {CATEGORY_LABELS[cat]}
              </div>
            ))}
          </div>
          <p className="chart-note" style={{ textAlign: "center" }}>
            Percentil vůči {pizza.poolSize.toLocaleString("cs-CZ")} hráčům se stejnou pozicí v lize {p.league_name}, min. 300 odehraných minut.
          </p>
        </div>
      )}

      <div className="profile-highlights">
        <div className="stat-box">
          <div className="stat-box-label">Věk</div>
          <div className="stat-box-value">{p.age ?? "–"}</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Zápasy</div>
          <div className="stat-box-value">{p.appearances ?? "–"}</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Minuty</div>
          <div className="stat-box-value">{formatStat("minutes_played", p.minutes_played)}</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Rating</div>
          <div className="stat-box-value">{formatStat("avg_rating_", p.avg_rating_)}</div>
        </div>
      </div>

      {p.form_ratings && p.form_ratings.length > 0 && (
        <div className="profile-group">
          <div className="profile-group-title">Forma (posledních {p.form_ratings.length} zápasů)</div>
          <div className="form-chart-panel">
            <FormLineChart ratings={[...p.form_ratings].reverse()} dates={[...(p.form_dates || [])].reverse()} />
          </div>
          {p.form_avg != null && <p className="form-avg-note">Průměr z posledních zápasů: <strong>{p.form_avg}</strong></p>}
        </div>
      )}

      {(p.market_value || p.contract_until || p.foot) && (
        <div className="profile-group">
          <div className="profile-group-title">Transfermarkt</div>
          <div className="profile-stat-grid">
            {p.market_value && (
              <div className="profile-stat-row">
                <span className="profile-stat-label">Tržní hodnota</span>
                <span className="profile-stat-value">{p.market_value}</span>
              </div>
            )}
            {p.contract_until && (
              <div className="profile-stat-row">
                <span className="profile-stat-label">Smlouva do</span>
                <span className="profile-stat-value">{p.contract_until}</span>
              </div>
            )}
            {p.foot && (
              <div className="profile-stat-row">
                <span className="profile-stat-label">Preferovaná noha</span>
                <span className="profile-stat-value">{FOOT_LABELS[p.foot.toLowerCase()] || p.foot}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {Object.entries(STAT_GROUPS).map(([group, keys]) => {
        const visible = keys.filter((k) => p[k] !== null && p[k] !== undefined && p[k] !== "");
        if (!visible.length) return null;
        return (
          <div key={group} className="profile-group">
            <div className="profile-group-title">{group}</div>
            <div className="profile-stat-grid">
              {visible.map((k) => (
                <div key={k} className="profile-stat-row">
                  <span className="profile-stat-label">{STAT_LABELS[k] || k}</span>
                  <span className="profile-stat-value">{formatStat(k, p[k])}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
