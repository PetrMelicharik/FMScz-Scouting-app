import fs from "fs";
import path from "path";
import Link from "next/link";
import { flagUrl } from "../lib/countryFlags";

function loadStats() {
  try {
    const file = path.join(process.cwd(), "public", "data", "players.json");
    const raw = fs.readFileSync(file, "utf-8");
    const data = JSON.parse(raw);
    const idx = {};
    data.columns.forEach((c, i) => { idx[c] = i; });
    const leaguesMap = new Map();
    const seasons = new Set();
    data.rows.forEach((r) => {
      const leagueName = idx.league_name >= 0 ? r[idx.league_name] : null;
      if (leagueName && !leaguesMap.has(leagueName)) {
        leaguesMap.set(leagueName, {
          name: leagueName,
          logo: idx.league_logo_url >= 0 ? r[idx.league_logo_url] : null,
          nationality: idx.league_nationality >= 0 ? r[idx.league_nationality] : null,
        });
      }
      if (idx.season >= 0 && r[idx.season] !== null && r[idx.season] !== undefined) seasons.add(String(r[idx.season]));
    });
    const seasonList = [...seasons].sort();
    const leagueList = [...leaguesMap.values()].sort((a, b) => a.name.localeCompare(b.name, "cs"));
    return {
      playerCount: data.rowCount,
      leagueCount: leaguesMap.size,
      season: seasonList[seasonList.length - 1] || "—",
      leagues: leagueList,
    };
  } catch (e) {
    return { playerCount: null, leagueCount: null, season: "—", leagues: [] };
  }
}

export default function HomePage() {
  const stats = loadStats();
  return (
    <div>
      <section className="hero">
        <img src="/logo.jpg" alt="FM Scouts cz" className="hero-logo" />
        <h1>
          Najdi příští <span className="accent">hvězdu</span> dřív než ostatní.
        </h1>
        <p>
          Databáze evropských fotbalových talentů s podrobnými výkonnostními
          statistikami — hledej, filtruj a porovnávej hráče na jednom místě.
        </p>
        <Link href="/databaze" className="btn-primary-lg">Prohlédnout databázi</Link>
      </section>

      <section className="stats-row">
        <div className="stat-card">
          <div className="stat-num">{stats.playerCount ? stats.playerCount.toLocaleString("cs-CZ") : "—"}</div>
          <div className="stat-label">HRÁČŮ</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{stats.leagueCount ?? "—"}</div>
          <div className="stat-label">LIG</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{stats.season}</div>
          <div className="stat-label">SEZÓNA</div>
        </div>
      </section>

      {stats.leagues.length > 0 && (
        <section className="leagues-section">
          <h2 className="leagues-title">Sledované ligy</h2>
          <div className="leagues-grid">
            {stats.leagues.map((l) => (
              <div key={l.name} className="league-chip">
                {l.logo && <img src={l.logo} alt="" className="league-chip-logo" />}
                {flagUrl(l.nationality) && <img src={flagUrl(l.nationality)} alt="" className="league-chip-flag" />}
                <span>{l.name}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
