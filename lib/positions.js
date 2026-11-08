// Konkrétní pozice podle Transfermarktu – pro filtr pozic v Databázi
// a ve Scouting toolu. Hodnota = přesný název z Transfermarktu (tak je
// uložený v tm_position a tm_other_positions), popisek = česky.
export const SPECIFIC_POSITIONS = [
  ["Goalkeeper", "Brankář"],
  ["Centre-Back", "Stoper"],
  ["Left-Back", "Levý obránce"],
  ["Right-Back", "Pravý obránce"],
  ["Defensive Midfield", "Defenzivní záložník"],
  ["Central Midfield", "Střední záložník"],
  ["Attacking Midfield", "Ofenzivní záložník"],
  ["Left Midfield", "Levý záložník"],
  ["Right Midfield", "Pravý záložník"],
  ["Left Winger", "Levé křídlo"],
  ["Right Winger", "Pravé křídlo"],
  ["Second Striker", "Podhrotový útočník"],
  ["Centre-Forward", "Hrotový útočník"],
];

const LABELS = Object.fromEntries(SPECIFIC_POSITIONS);

// Český popisek pozice (neznámou pozici vrátí beze změny)
export function positionLabel(pos) {
  return LABELS[pos] || pos;
}

// Vedlejší pozice hráče jako pole (prázdné, když nejsou nebo ještě nejsou stažené)
export function otherPositions(row) {
  return Array.isArray(row?.tm_other_positions) ? row.tm_other_positions : [];
}

// Projde hráč filtrem konkrétních pozic? Bez zvolené pozice projde každý.
// Hlavní pozice se bere z Transfermarktu; s includeOther stačí shoda
// i v některé z vedlejších pozic.
export function matchesSpecificPositions(row, selected, includeOther) {
  if (!selected || selected.length === 0) return true;
  if (selected.includes(row.tm_position)) return true;
  return includeOther && otherPositions(row).some((p) => selected.includes(p));
}
