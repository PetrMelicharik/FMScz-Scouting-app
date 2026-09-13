import fs from "fs";
import path from "path";
import Link from "next/link";

function loadStats() {
  try {
    const file = path.join(process.cwd(), "public", "data", "players.json");
    const raw = fs.readFileSync(file, "utf-8");
    const data = JSON.parse(raw);
    const leagueIdx = data.columns.indexOf("league_name");
    const seasonIdx = data.columns.indexOf("season");
    const leagues = new Set();
    const seasons = new Set();
    data.rows.forEach((r) => {
      if (leagueIdx >= 0 && r[leagueIdx]) leagues.add(r[leagueIdx]);
      if (seasonIdx >= 0 && r[seasonIdx] !== null && r[seasonIdx] !== undefined) seasons.add(String(r[seasonIdx]));
    });
    const seasonList = [...seasons].sort();
    return {
      playerCount: data.rowCount,
      leagueCount: leagues.size,
      season: seasonList[seasonList.length - 1] || "—",
    };
  } catch (e) {
    return { playerCount: null, leagueCount: null, season: "—" };
  }
}

export default function HomePage() {
  const stats = loadStats();
  return (
    <div>
      <section className="hero">
        <img src="/logo.jpg" alt="FM Scouts.cz" className="hero-logo" />
        <h1>
          Najdi příští <span className="accent">hvězdu</span> dřív než ostatní.
        </h1>
        <p>
          Skautská databáze evropských fotbalových talentů s podrobnými výkonnostními
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
    </div>
  );
}
