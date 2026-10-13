// Link to a player's profile. Uses the stable profile_slug (name + date of
// birth) — not the row number, which changes with every database update.
export function playerHref(p) {
  return `/databaze/${p?.profile_slug || p?._id}`;
}
