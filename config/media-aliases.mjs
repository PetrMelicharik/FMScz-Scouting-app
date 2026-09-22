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
// Všech 26 lig je zamčeno na konkrétní ID (ověřeno ručně přes dashboard) —
// eliminuje to riziko, že se automatické párování jménem někdy v budoucnu
// trefí do podobně pojmenované soutěže (přesně to se stalo u švédské ligy).
export const leagueAliases = {
  "Austrian Bundesliga": 218,
  "Austrian 2. Liga": 219,
  "Bosnian WWIN Liga BiH": 315,
  "Bulgarian Parva Liga": 172,
  "Croatian HNL": 210,
  "Czech Chance Liga": 345,
  "Czech Chance Národní Liga": 346,
  "Danish Superliga": 119,
  "Danish Betinia Liga": 120,
  "Estonian Premium Liiga": 329,
  "Finland Veikkausliiga": 244,
  "Hungarian Fizz Liga": 271,
  "Latvian Virsliga": 365,
  "Eliteserien": 103,
  "Norway First Division": 104,
  "Polish Ekstraklasa": 106,
  "Polish Betclic 1. Liga": 107,
  "Romanian SuperLiga": 283,
  "Serbian Mozzart Bet Superliga": 286,
  "Serbian Mozzart Bet Prva Liga": 287,
  "Slovak Niké Liga": 332,
  "Slovenian PrvaLiga": 373,
  "Sweden Allsvenskan": 113,
  "Sweden Superettan": 114,
  "Swiss Super League": 207,
  "Ukraine Premier League": 333,
};

// Value: the club's numeric API-Football team ID (fastest/most reliable —
// look it up once on the dashboard and paste the number in).
export const clubAliases = {
  "OB": 405,
  "København": 400,
  "Hillerød": 6026,
  "Rapid Wien": 781, // opraveno — auto-shoda spletla A-tým s rezervou (Rapid Wien II)
  "Rapid Wien II": 8247, // opraveno — viz výše
  "Harju Jalgpallikool": 18657,
  "Puszcza Niepołomice": 3490,
  "ŁKS Łódź": 3498,
  "Red Star Belgrade": 598,
  "Javor Ivanjica": 2653,
  "Slaven Koprivnica": 1018, // opraveno — 5710 byl špatný klub, správně je to Slaven Belupo
  "Trans": 2274,
  "Nyíregyháza Spartacus": 2403,
  "Argeș": 2592,
  "Mačva Šabac": 2637, // opraveno — 12324 bylo špatně
  "Radnički Kragujevac": 26417, // nejistá shoda (jiný historický název klubu), zkontroluj logo po nasazení
  "Veres": 6501,
  "Zorya": 599,
  "Hirnyk": 3624,
  "AB": 24213,
  "Blau-Weiß Linz": 1394,
  "Young Boys": 565, // opraveno — auto-shoda podle jména byla špatná
  "Brage": 2175, // opraveno — auto-shoda podle jména byla špatná
  "ETO": 2402, // opraveno — auto-shoda podle jména byla špatná
  "DAC": 2257, // opraveno — auto-shoda podle jména byla špatná
  "AIK": 377, // opraveno — auto-shoda podle jména byla špatná
  "Hajduk Split": 608, // opraveno — auto-shoda podle jména byla špatná
  "Salzburg": 571, // opraveno — auto-shoda podle jména byla špatná
  "Gorica": 1068, // opraveno — trefilo se do slovinského klubu se stejným názvem
  "Osijek": 616, // opraveno — auto-shoda podle jména byla špatná
};
