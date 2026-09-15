// Manual overrides for names the automatic matching in scripts/fetch-media.mjs
// can't confidently resolve on its own (most often league names that use a
// sponsor name on one side but not the other, e.g. "Hungarian Fizz Liga" vs
// API-Football's "NB I").
//
// After running the script once, check data/media-cache/unmatched-report.json —
// it lists every league/club it couldn't match with confidence. Look the
// correct name (or numeric API-Football ID) up on https://dashboard.api-football.com
// and add it below, using the EXACT league_name / Current Club string from
// your own database as the key (left side).

// Value: the league's name as it appears in API-Football, OR its numeric ID.
export const leagueAliases = {
  // "Hungarian Fizz Liga": "NB I",
  // "Serbian Mozzart Bet Superliga": "Super Liga Srbije",
};

// Value: the club's numeric API-Football team ID (fastest/most reliable —
// look it up once on the dashboard and paste the number in).
export const clubAliases = {
  // "FC Example": 12345,
};
