// Fetches league logos, club logos, player photos, AND recent-match ratings
// (last 6 games per player, for a "form" view) from API-Football and matches
// them against data/db.xlsx, writing the result to data/media-map.json and
// data/form-map.json (both consumed by scripts/build-data.mjs at build time).
//
// Run locally (NOT on Vercel — this hits a paid, rate-limited API):
//   node scripts/fetch-media.mjs                 # full run
//   node scripts/fetch-media.mjs --skip-squads    # cheap dry run: just leagues+clubs
//   node scripts/fetch-media.mjs --skip-form      # skip the recent-form phase only
//   node scripts/fetch-media.mjs --force          # ignore all caches, refetch everything
//
// Requires API_FOOTBALL_KEY in .env.local (see .env.local.example).
// Optional: API_FOOTBALL_PROVIDER=rapidapi if you access the API through
// RapidAPI instead of the api-sports.io dashboard (default: "direct").

import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import {
  normalizeClubName,
  normalizeLeagueName,
  normalizePlayerName,
  playerNameScore,
  similarity,
  playerClubKey,
  stripDiacritics,
} from "../lib/normalize.js";
import { leagueAliases, clubAliases, countryCodeAliases } from "../config/media-aliases.mjs";

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, "data", "media-cache");
const OUT_FILE = path.join(ROOT, "data", "media-map.json");
const FORM_OUT_FILE = path.join(ROOT, "data", "form-map.json");
const REPORT_FILE = path.join(ROOT, "data", "unmatched-report.json");

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const SKIP_SQUADS = args.includes("--skip-squads");
const SKIP_FORM = args.includes("--skip-form") || SKIP_SQUADS;

const RATE_LIMIT_MS = Number(process.env.API_FOOTBALL_RATE_LIMIT_MS || 200);
const LEAGUE_MATCH_THRESHOLD = 0.55;
const CLUB_MATCH_THRESHOLD = 0.6;
const PLAYER_MATCH_THRESHOLD = 0.7;
const FORM_LAST_N = 6;
const SEASON = 2026;

/* ------------------------------------------------------------------ */
/* .env.local loader (no dependency — just enough for API_FOOTBALL_*)  */
/* ------------------------------------------------------------------ */

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  content.split("\n").forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  });
}
loadEnvLocal();

const API_KEY = process.env.API_FOOTBALL_KEY;
const PROVIDER = process.env.API_FOOTBALL_PROVIDER || "direct";

if (!API_KEY) {
  console.error("\n[fetch-media] Chybí API_FOOTBALL_KEY. Vytvoř .env.local podle .env.local.example.\n");
  process.exit(1);
}

const BASE_URL =
  PROVIDER === "rapidapi"
    ? "https://api-football-v1.p.rapidapi.com/v3"
    : "https://v3.football.api-sports.io";

function authHeaders() {
  if (PROVIDER === "rapidapi") {
    return {
      "x-rapidapi-key": API_KEY,
      "x-rapidapi-host": "api-football-v1.p.rapidapi.com",
    };
  }
  return { "x-apisports-key": API_KEY };
}

/* ------------------------------------------------------------------ */
/* HTTP helper: rate limiting + retry on 429 / API-level errors        */
/* ------------------------------------------------------------------ */

function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

let requestCount = 0;

async function apiGet(endpoint, params = {}) {
  const url = new URL(BASE_URL + endpoint);
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) url.searchParams.set(k, v); });

  for (let attempt = 1; attempt <= 4; attempt++) {
    await sleep(RATE_LIMIT_MS);
    requestCount++;
    let res;
    try {
      res = await fetch(url, { headers: authHeaders() });
    } catch (e) {
      console.warn(`  [warn] síťová chyba (${e.message}), zkouším znovu…`);
      await sleep(1000 * attempt);
      continue;
    }
    if (res.status === 429) {
      console.warn(`  [warn] rate limit (429), čekám ${attempt * 2}s…`);
      await sleep(2000 * attempt);
      continue;
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} pro ${url.pathname}${url.search}`);
    }
    const json = await res.json();
    if (json.errors && Object.keys(json.errors).length) {
      const msg = JSON.stringify(json.errors);
      if (msg.toLowerCase().includes("limit")) {
        console.error(`\n[fetch-media] API hlásí vyčerpaný limit: ${msg}\nKončím — zatím uložený postup zůstává v cache.\n`);
        await flushAndExit(1);
      }
      console.warn(`  [warn] API chyba pro ${url.pathname}${url.search}: ${msg}`);
      return { response: [] };
    }
    return json;
  }
  throw new Error(`Opakovaně selhalo volání ${url.pathname}${url.search}`);
}

/* ------------------------------------------------------------------ */
/* Disk cache helpers (resumable — safe to Ctrl+C and rerun)           */
/* ------------------------------------------------------------------ */

function cachePath(name) { return path.join(CACHE_DIR, name); }

function readCache(name) {
  if (FORCE) return null;
  const p = cachePath(name);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
}

function writeCache(name, data) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath(name), JSON.stringify(data));
}

function safeFileName(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

let interrupted = false;
process.on("SIGINT", async () => {
  console.log("\n[fetch-media] Přerušeno — ukládám dosavadní postup…");
  interrupted = true;
});

async function flushAndExit(code) {
  process.exit(code);
}

/* ------------------------------------------------------------------ */
/* 1. Read our database                                                */
/* ------------------------------------------------------------------ */

function readOurDatabase() {
  const src = path.join(ROOT, "data", "db.xlsx");
  const wb = XLSX.readFile(src);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const rawHeader = aoa[0];
  const keepIdx = [];
  const columns = [];
  rawHeader.forEach((h, i) => {
    const name = h === null || h === undefined ? "" : String(h).trim();
    if (!name || /^unnamed/i.test(name)) return;
    keepIdx.push(i);
    columns.push(name);
  });
  const idx = Object.fromEntries(columns.map((c, i) => [c, i]));
  const rows = aoa
    .slice(1)
    .filter((row) => row.some((v) => v !== null && v !== undefined && v !== ""))
    .map((row) => keepIdx.map((i) => (row[i] === undefined ? null : row[i])));
  return { columns, idx, rows };
}

/* ------------------------------------------------------------------ */
/* 2a. Resolve country names to API-Football 2-letter codes            */
/*     (the /leagues "country" param rejects values with spaces —      */
/*     e.g. "Bosnia and Herzegovina" — so we use "code" instead)       */
/* ------------------------------------------------------------------ */

async function resolveCountries(countryNames) {
  console.log(`\n[fetch-media] Fáze 0/4: země (${countryNames.length})…`);
  const cacheName = "countries.json";
  let allCountries = readCache(cacheName);
  if (!allCountries) {
    const json = await apiGet("/countries", {});
    allCountries = json.response || [];
    writeCache(cacheName, allCountries);
  }

  const codeByOurCountry = {};
  for (const ourCountry of countryNames) {
    if (countryCodeAliases[ourCountry]) {
      codeByOurCountry[ourCountry] = countryCodeAliases[ourCountry];
      continue;
    }
    const ourNorm = normalizeLeagueName(ourCountry);
    let best = null, bestScore = 0;
    for (const c of allCountries) {
      const score = similarity(ourNorm, normalizeLeagueName(c.name));
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (best && bestScore >= 0.6) {
      codeByOurCountry[ourCountry] = best.code;
    } else {
      console.warn(`  [warn] země nenalezena: "${ourCountry}" (nejlepší shoda: ${best ? best.name : "žádná"}, skóre ${bestScore.toFixed(2)}) — doplň countryCodeAliases v config/media-aliases.mjs`);
    }
  }
  console.log(`  Spárováno ${Object.keys(codeByOurCountry).length}/${countryNames.length} zemí.`);
  return codeByOurCountry;
}

function rankCandidates(ourNorm, candidates, getName) {
  const scored = candidates
    .map((c) => ({ item: c, score: similarity(ourNorm, getName(c)) }))
    .sort((a, b) => b.score - a.score);
  return scored;
}

/* ------------------------------------------------------------------ */
/* 2. Resolve leagues (by country code, then fuzzy-match name)         */
/* ------------------------------------------------------------------ */

async function resolveLeagues(leagueInfo, codeByOurCountry) {
  // leagueInfo: Map(league_name -> { country })
  console.log(`\n[fetch-media] Fáze 1/4: ligy (${leagueInfo.size} lig)…`);
  const countries = [...new Set([...leagueInfo.values()].map((v) => v.country).filter(Boolean))];
  const leaguesByCountry = new Map();

  for (const country of countries) {
    const code = codeByOurCountry[country];
    if (!code) { leaguesByCountry.set(country, []); continue; }
    const cacheName = `leagues-${code}.json`;
    let data = readCache(cacheName);
    if (!data) {
      console.log(`  → GET /leagues?code=${code} (${country})`);
      const json = await apiGet("/leagues", { code });
      data = json.response || [];
      writeCache(cacheName, data);
    }
    leaguesByCountry.set(country, data);
  }

  const matches = {};
  const unmatched = [];

  for (const [ourLeagueName, { country }] of leagueInfo) {
    if (leagueAliases[ourLeagueName]) {
      const alias = leagueAliases[ourLeagueName];
      const candidates = leaguesByCountry.get(country) || [];
      const found = typeof alias === "number"
        ? candidates.find((c) => c.league.id === alias)
        : candidates.find((c) => normalizeLeagueName(c.league.name) === normalizeLeagueName(alias));
      if (found) {
        matches[ourLeagueName] = { id: found.league.id, name: found.league.name, logo: found.league.logo };
        console.log(`  ✓ ${ourLeagueName} -> "${found.league.name}" (id ${found.league.id}) [alias]`);
        continue;
      }
    }
    const candidates = leaguesByCountry.get(country) || [];
    const ourNorm = normalizeLeagueName(ourLeagueName);
    const ranked = rankCandidates(ourNorm, candidates, (c) => normalizeLeagueName(c.league.name));
    const best = ranked[0]?.item;
    const bestScore = ranked[0]?.score || 0;
    if (best && bestScore >= LEAGUE_MATCH_THRESHOLD) {
      matches[ourLeagueName] = { id: best.league.id, name: best.league.name, logo: best.league.logo, score: Number(bestScore.toFixed(2)) };
      console.log(`  ✓ ${ourLeagueName} -> "${best.league.name}" (id ${best.league.id}, skóre ${bestScore.toFixed(2)})`);
    } else {
      unmatched.push({
        ourLeagueName,
        country,
        candidates: ranked.slice(0, 5).map((r) => ({ name: r.item.league.name, id: r.item.league.id, score: Number(r.score.toFixed(2)) })),
      });
    }
  }

  console.log(`  Spárováno ${Object.keys(matches).length}/${leagueInfo.size} lig.`);
  return { matches, unmatched };
}

/* ------------------------------------------------------------------ */
/* 3. Resolve clubs (search by name, scoped to country when known)     */
/* ------------------------------------------------------------------ */

async function resolveClubs(clubInfo) {
  // clubInfo: Map(clubName -> { country })
  console.log(`\n[fetch-media] Fáze 2/4: kluby (${clubInfo.size} klubů)…`);
  const matches = {};
  const unmatched = [];
  let i = 0;

  for (const [clubName, { country }] of clubInfo) {
    i++;
    if (interrupted) break;
    const cacheName = `team-${safeFileName(clubName)}.json`;
    let candidates = readCache(cacheName);

    if (clubAliases[clubName] && typeof clubAliases[clubName] === "number") {
      if (!candidates) {
        const json = await apiGet("/teams", { id: clubAliases[clubName] });
        candidates = json.response || [];
        writeCache(cacheName, candidates);
      }
    } else if (!candidates) {
      const searchTerm = stripDiacritics(clubName).replace(/[^a-zA-Z0-9\s.]/g, " ").replace(/\s+/g, " ").trim();
      console.log(`  [${i}/${clubInfo.size}] GET /teams?search=${searchTerm}`);
      const json = await apiGet("/teams", { search: searchTerm });
      candidates = json.response || [];
      if (!candidates.length) {
        const tokens = searchTerm.split(" ").filter((t) => t.length >= 3).sort((a, b) => b.length - a.length);
        if (tokens.length) {
          const json2 = await apiGet("/teams", { search: tokens[0] });
          candidates = json2.response || [];
        }
      }
      writeCache(cacheName, candidates);
    }

    const ourNorm = normalizeClubName(clubName);
    const ranked = rankCandidates(ourNorm, candidates, (c) => normalizeClubName(c.team.name));
    const best = ranked[0]?.item;
    const bestScore = ranked[0]?.score || 0;
    if (best && (bestScore >= CLUB_MATCH_THRESHOLD || clubAliases[clubName])) {
      matches[clubName] = { id: best.team.id, name: best.team.name, logo: best.team.logo, score: Number(bestScore.toFixed(2)) };
    } else {
      unmatched.push({
        clubName,
        country,
        candidates: ranked.slice(0, 5).map((r) => ({ name: r.item.team.name, id: r.item.team.id, country: r.item.team.country, score: Number(r.score.toFixed(2)) })),
      });
    }
  }

  console.log(`  Spárováno ${Object.keys(matches).length}/${clubInfo.size} klubů.`);
  return { matches, unmatched };
}

/* ------------------------------------------------------------------ */
/* 4. Fetch squads for matched clubs, match players against our roster */
/* ------------------------------------------------------------------ */

async function fetchSquads(clubMatches, rosterByClub) {
  console.log(`\n[fetch-media] Fáze 3/4: soupisky hráčů (${Object.keys(clubMatches).length} klubů)…`);
  const playerPhotos = {};
  const unmatchedPlayers = [];
  let i = 0;
  const entries = Object.entries(clubMatches);

  for (const [ourClubName, team] of entries) {
    i++;
    if (interrupted) break;
    const cacheName = `squad-${team.id}.json`;
    let squadPlayers = readCache(cacheName);
    if (!squadPlayers) {
      console.log(`  [${i}/${entries.length}] GET /players/squads?team=${team.id} (${ourClubName})`);
      const json = await apiGet("/players/squads", { team: team.id });
      squadPlayers = (json.response && json.response[0] && json.response[0].players) || [];
      writeCache(cacheName, squadPlayers);
    }

    const ourRoster = rosterByClub.get(ourClubName) || new Set();
    const ourRosterList = [...ourRoster];

    for (const sp of squadPlayers) {
      let best = null, bestScore = 0;
      for (const ourName of ourRosterList) {
        const score = playerNameScore(sp.name, ourName);
        if (score > bestScore) { bestScore = score; best = ourName; }
      }
      if (best && bestScore >= PLAYER_MATCH_THRESHOLD) {
        playerPhotos[playerClubKey(best, ourClubName)] = sp.photo;
      }
    }
  }

  const matchedCount = Object.keys(playerPhotos).length;
  console.log(`  Napárováno fotek: ${matchedCount}.`);
  return { playerPhotos, unmatchedPlayers };
}

/* ------------------------------------------------------------------ */
/* 5. Fetch last-N-matches ratings ("form") for matched clubs          */
/* ------------------------------------------------------------------ */

async function fetchForm(clubMatches, rosterByClub, clubToLeagueId) {
  console.log(`\n[fetch-media] Fáze 4/4: forma z posledních ${FORM_LAST_N} zápasů (${Object.keys(clubMatches).length} klubů)…`);
  const formMap = {};
  const fixturePlayersCache = new Map(); // fixtureId -> response, shared across clubs (two clubs can share a fixture)
  let i = 0;
  const entries = Object.entries(clubMatches);

  for (const [ourClubName, team] of entries) {
    i++;
    if (interrupted) break;

    const leagueId = clubToLeagueId.get(ourClubName) || null;
    const fixCacheName = `fixtures-team-${team.id}${leagueId ? `-l${leagueId}` : ""}.json`;
    let fixtures = readCache(fixCacheName);
    if (!fixtures) {
      const params = { team: team.id, last: FORM_LAST_N };
      if (leagueId) { params.league = leagueId; params.season = SEASON; }
      console.log(`  [${i}/${entries.length}] GET /fixtures?team=${team.id}&last=${FORM_LAST_N}${leagueId ? `&league=${leagueId}` : ""} (${ourClubName})`);
      const json = await apiGet("/fixtures", params);
      fixtures = json.response || [];
      writeCache(fixCacheName, fixtures);
    }
    fixtures = [...fixtures].sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date));

    const ourRoster = rosterByClub.get(ourClubName) || new Set();
    const ourRosterList = [...ourRoster];
    const perPlayer = new Map(); // ourName -> [{date, rating}], newest first

    for (const fx of fixtures) {
      const fid = fx.fixture.id;
      let fpBlocks = fixturePlayersCache.get(fid);
      if (!fpBlocks) {
        const cacheName = `fixture-players-${fid}.json`;
        let cached = readCache(cacheName);
        if (!cached) {
          const json = await apiGet("/fixtures/players", { fixture: fid });
          cached = json.response || [];
          writeCache(cacheName, cached);
        }
        fixturePlayersCache.set(fid, cached);
        fpBlocks = cached;
      }

      const teamBlock = fpBlocks.find((tb) => tb.team.id === team.id);
      if (!teamBlock) continue;

      for (const p of teamBlock.players || []) {
        const stat = p.statistics?.[0];
        const rating = stat?.games?.rating ? Number(stat.games.rating) : null;
        if (rating === null) continue;

        let best = null, bestScore = 0;
        for (const ourName of ourRosterList) {
          const score = playerNameScore(p.player.name, ourName);
          if (score > bestScore) { bestScore = score; best = ourName; }
        }
        if (best && bestScore >= PLAYER_MATCH_THRESHOLD) {
          if (!perPlayer.has(best)) perPlayer.set(best, []);
          perPlayer.get(best).push({ date: fx.fixture.date, rating });
        }
      }
    }

    for (const [ourName, ratings] of perPlayer) {
      const capped = ratings.slice(0, FORM_LAST_N);
      const avg = capped.reduce((a, b) => a + b.rating, 0) / capped.length;
      formMap[playerClubKey(ourName, ourClubName)] = {
        ratings: capped,
        avg: Number(avg.toFixed(2)),
      };
    }
  }

  console.log(`  Forma napárována u ${Object.keys(formMap).length} hráčů.`);
  return formMap;
}

/* ------------------------------------------------------------------ */
/* main                                                                 */
/* ------------------------------------------------------------------ */

async function main() {
  console.log(`[fetch-media] Provider: ${PROVIDER}, base URL: ${BASE_URL}`);
  const { idx, rows } = readOurDatabase();

  const leagueInfo = new Map();
  const clubInfo = new Map();
  const rosterByClub = new Map();
  const clubToLeagueName = new Map();

  for (const row of rows) {
    const leagueName = row[idx.league_name];
    const leagueCountry = row[idx.league_nationality];
    const club = row[idx["Current Club"]];
    const playerName = row[idx.player_name];

    if (leagueName && !leagueInfo.has(leagueName)) leagueInfo.set(leagueName, { country: leagueCountry });
    if (club && !clubInfo.has(club)) clubInfo.set(club, { country: leagueCountry });
    if (club && leagueName && !clubToLeagueName.has(club)) clubToLeagueName.set(club, leagueName);
    if (club && playerName) {
      if (!rosterByClub.has(club)) rosterByClub.set(club, new Set());
      rosterByClub.get(club).add(playerName);
    }
  }

  const uniqueCountries = [...new Set([...leagueInfo.values()].map((v) => v.country).filter(Boolean))];
  const codeByOurCountry = await resolveCountries(uniqueCountries);

  const { matches: leagueMatches, unmatched: unmatchedLeagues } = await resolveLeagues(leagueInfo, codeByOurCountry);
  const { matches: clubMatches, unmatched: unmatchedClubs } = await resolveClubs(clubInfo);

  let playerPhotos = {};
  if (!SKIP_SQUADS && !interrupted) {
    const result = await fetchSquads(clubMatches, rosterByClub);
    playerPhotos = result.playerPhotos;
  } else if (SKIP_SQUADS) {
    console.log(`\n[fetch-media] --skip-squads: přeskakuji fázi 3 (fotky hráčů). Zkontroluj napárování lig/klubů výše.`);
  }

  let formMap = {};
  if (!SKIP_FORM && !interrupted) {
    const clubToLeagueId = new Map();
    for (const [club, leagueName] of clubToLeagueName) {
      const leagueId = leagueMatches[leagueName]?.id;
      if (leagueId) clubToLeagueId.set(club, leagueId);
    }
    formMap = await fetchForm(clubMatches, rosterByClub, clubToLeagueId);
  } else if (SKIP_FORM && !SKIP_SQUADS) {
    console.log(`\n[fetch-media] --skip-form: přeskakuji fázi 4 (forma z posledních zápasů).`);
  }

  const leagues = Object.fromEntries(Object.entries(leagueMatches).map(([k, v]) => [k, v.logo]));
  const clubs = Object.fromEntries(Object.entries(clubMatches).map(([k, v]) => [k, v.logo]));

  const mediaMap = {
    generatedAt: new Date().toISOString(),
    stats: {
      leaguesMatched: Object.keys(leagueMatches).length,
      leaguesTotal: leagueInfo.size,
      clubsMatched: Object.keys(clubMatches).length,
      clubsTotal: clubInfo.size,
      playersMatched: Object.keys(playerPhotos).length,
      requestsUsed: requestCount,
    },
    leagues,
    clubs,
    players: playerPhotos,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(mediaMap));
  fs.writeFileSync(FORM_OUT_FILE, JSON.stringify(formMap));
  const matchedLeagues = Object.entries(leagueMatches).map(([ourName, m]) => ({
    ourLeagueName: ourName,
    apiName: m.name,
    apiId: m.id,
  }));
  fs.writeFileSync(REPORT_FILE, JSON.stringify({ matchedLeagues, unmatchedLeagues, unmatchedClubs }, null, 2));

  console.log(`\n[fetch-media] Hotovo. Použito requestů: ${requestCount}.`);
  console.log(`  Ligy:  ${mediaMap.stats.leaguesMatched}/${mediaMap.stats.leaguesTotal}`);
  console.log(`  Kluby: ${mediaMap.stats.clubsMatched}/${mediaMap.stats.clubsTotal}`);
  console.log(`  Fotky hráčů: ${mediaMap.stats.playersMatched}`);
  console.log(`  Forma hráčů: ${Object.keys(formMap).length}`);
  console.log(`\n  -> data/media-map.json (commitni do repa)`);
  console.log(`  -> data/form-map.json (commitni do repa)`);
  if (unmatchedLeagues.length || unmatchedClubs.length) {
    console.log(`  -> data/unmatched-report.json (${unmatchedLeagues.length} lig, ${unmatchedClubs.length} klubů k ruční kontrole)`);
    console.log(`     Doplň je do config/media-aliases.mjs a spusť skript znovu.`);
  }
}

main().catch((e) => {
  console.error("\n[fetch-media] Chyba:", e);
  process.exit(1);
});
