import Link from "next/link";
import { notFound } from "next/navigation";
import Avatar from "../../../components/Avatar";
import PitchIcon from "../../../components/PitchIcon";
import { STAT_GROUPS, STAT_LABELS, formatStat } from "../../../lib/statMeta";
import { flagUrl } from "../../../lib/countryFlags";
import { loadPlayerById } from "../../../lib/playersData";

const FOOT_LABELS = { right: "Pravá", left: "Levá", both: "Obě" };

export default function PlayerPage({ params }) {
  const p = loadPlayerById(params.id);
  if (!p) return notFound();

  return (
    <div className="profile">
      <Link href="/databaze" className="btn-ghost profile-back">← Zpět na databázi</Link>

      <div className="profile-header">
        <Avatar src={p.photo_url} size={72} className="profile-avatar" />
        <div>
          <h1 className="profile-name">{p.player_name}</h1>
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
          <div className="stat-box-label">Národnost</div>
          <div className="stat-box-value stat-box-value-sm stat-box-flag">
            {flagUrl(p.nationality) && <img src={flagUrl(p.nationality)} alt="" className="flag-mini" />}
            {p.nationality || "–"}
          </div>
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
