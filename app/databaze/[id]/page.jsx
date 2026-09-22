import BackButton from "../../../components/BackButton";
import { notFound } from "next/navigation";
import Avatar from "../../../components/Avatar";
import PitchIcon from "../../../components/PitchIcon";
import { STAT_GROUPS, STAT_LABELS, formatStat } from "../../../lib/statMeta";
import { flagUrl } from "../../../lib/countryFlags";
import { loadPlayerById } from "../../../lib/playersData";

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

export default function PlayerPage({ params }) {
  const p = loadPlayerById(params.id);
  if (!p) return notFound();

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
