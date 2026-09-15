// Normalizes names for fuzzy matching between FootyStats-derived names
// (in our database) and API-Football names. Used both by the media-fetch
// script and at build time to look values back up from the media map.

// Characters like ø, ł, đ don't decompose into "base letter + combining mark"
// under Unicode NFD, so the strip-combining-marks trick below leaves them
// untouched. Map them explicitly — several leagues in this dataset (Danish,
// Norwegian, Polish, ex-Yugoslav) use them in club names.
const EXTRA_CHAR_MAP = {
  ø: "o", Ø: "O",
  đ: "d", Đ: "D",
  ł: "l", Ł: "L",
  ß: "ss",
  æ: "ae", Æ: "AE",
  œ: "oe", Œ: "OE",
};

export function stripDiacritics(str) {
  const mapped = String(str).replace(/[øØđĐłŁßæÆœŒ]/g, (ch) => EXTRA_CHAR_MAP[ch]);
  return mapped.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const CLUB_NOISE_WORDS = [
  "fc", "cf", "sc", "ac", "sk", "fk", "bk", "if", "afc", "cfc",
  "club", "football", "soccer", "united", "city",
];

export function normalizeClubName(name) {
  if (!name) return "";
  let s = stripDiacritics(String(name)).toLowerCase();
  s = s.replace(/[^a-z0-9\s]/g, " ");
  const tokens = s.split(/\s+/).filter(Boolean).filter((t) => !CLUB_NOISE_WORDS.includes(t));
  return tokens.join(" ").trim();
}

export function normalizeLeagueName(name) {
  if (!name) return "";
  let s = stripDiacritics(String(name)).toLowerCase();
  s = s.replace(/[^a-z0-9\s]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

export function normalizePlayerName(name) {
  if (!name) return "";
  let s = stripDiacritics(String(name)).toLowerCase();
  s = s.replace(/[^a-z0-9\s]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

// Simple Levenshtein distance, used to score fuzzy matches when an exact
// normalized match isn't found.
export function levenshtein(a, b) {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = new Array(bl + 1);
  let curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[bl];
}

// Similarity in [0, 1], 1 = identical (after normalization).
export function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - dist / maxLen;
}

export function playerClubKey(playerName, clubName) {
  return `${normalizePlayerName(playerName)}::${normalizeClubName(clubName)}`;
}

// Player names need special handling: API-Football commonly returns
// abbreviated first names ("D. Beljo") while our database has full names
// ("Dominik Beljo"). Plain Levenshtein on the whole string scores that low
// even though it's the same person — so compare surname and first-name/
// initial separately and weight surname more heavily.
export function playerNameScore(nameA, nameB) {
  const a = normalizePlayerName(nameA);
  const b = normalizePlayerName(nameB);
  if (!a || !b) return 0;
  const aTokens = a.split(" ");
  const bTokens = b.split(" ");
  const aLast = aTokens[aTokens.length - 1];
  const bLast = bTokens[bTokens.length - 1];
  const lastSim = similarity(aLast, bLast);

  const aFirst = aTokens[0];
  const bFirst = bTokens[0];
  let firstScore = 0;
  if (aFirst && bFirst) {
    if (aFirst.length === 1 || bFirst.length === 1) {
      firstScore = aFirst[0] === bFirst[0] ? 1 : 0;
    } else {
      firstScore = similarity(aFirst, bFirst);
    }
  }
  return lastSim * 0.75 + firstScore * 0.25;
}
