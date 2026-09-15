// Manual overrides for names the automatic matching in scripts/fetch-media.mjs
// can't confidently resolve on its own (most often league names that use a
// sponsor name on one side but not the other, e.g. "Hungarian Fizz Liga" vs
// API-Football's "NB I").
//
// After running the script once, check data/unmatched-report.json (committed
// to the repo by the GitHub Actions workflow — no need to run anything
// locally) — it lists every league/club it couldn't match with confidence,
// each with its top 5 candidate matches and scores. Pick the right one and
// add it below, using the EXACT league_name / Current Club / league_nationality
// string from your own database as the key (left side).

// Value: API-Football's 2-letter country code (ISO 3166-1 alpha-2), e.g. "CZ".
// Use this when a league_nationality value in your database doesn't
// auto-match against API-Football's /countries list.
export const countryCodeAliases = {
  "Czechia": "CZ",
  "Bosnia and Herzegovina": "BA",
};

// Value: the league's name as it appears in API-Football, OR its numeric ID.
export const leagueAliases = {
  "Austrian Bundesliga": "Bundesliga",
  "Austrian 2. Liga": "2. Liga",
  "Bosnian WWIN Liga BiH": 315,
  "Bulgarian Parva Liga": 172,
  "Croatian HNL": 210,
  "Estonian Premium Liiga": 329,
  "Polish Betclic 1. Liga": 107,
  "Hungarian Fizz Liga": 271,
  "Latvian Virsliga": 365,
  "Norway First Division": 104,
  "Serbian Mozzart Bet Superliga": 286,
  "Serbian Mozzart Bet Prva Liga": 287,
  "Slovak Niké Liga": 332,
  "Slovenian PrvaLiga": 373,
  "Danish Betinia Liga": 120,
  "Romanian SuperLiga": 283,
};

// Value: the club's numeric API-Football team ID (fastest/most reliable —
// look it up once on the dashboard and paste the number in).
export const clubAliases = {
  "OB": 405,
  "København": 400,
  "Hillerød": 6026,
  "Harju Jalgpallikool": 18657,
  "Puszcza Niepołomice": 3490,
  "ŁKS Łódź": 3498,
  "Red Star Belgrade": 598,
  "Javor Ivanjica": 2653,
  "Slaven Koprivnica": 5710,
  "Trans": 2274,
  "Nyíregyháza Spartacus": 2403,
  "Argeș": 2592,
  "Mačva Šabac": 12324,
  "Radnički Kragujevac": 26417, // nejistá shoda (jiný historický název klubu), zkontroluj logo po nasazení
  "Veres": 6501,
  "Zorya": 599,
  "Hirnyk": 3624,
  "AB": 24213,
  "Blau-Weiß Linz": 1394,
};
