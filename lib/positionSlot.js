// Classifies a raw position string into one representative slot for the
// small "where does this player play" pitch graphic on the profile page.
// Deliberately separate from the Tým týdne formation classifier — this one
// only needs ONE dot per player, not a full 11-man layout.

function classifyRaw(pos) {
  if (!pos) return null;
  const p = pos.toLowerCase();
  if (p.includes("goalkeeper")) return "GK";
  if (p.includes("right back") || p.includes("right-back") || p.includes("right wing back") || p.includes("right wing-back")) return "RB";
  if (p.includes("left back") || p.includes("left-back") || p.includes("left wing back") || p.includes("left wing-back")) return "LB";
  if (p.includes("centre back") || p.includes("center back") || p.includes("centre-back") || p.includes("center-back")) return "CB";
  if (p.includes("attacking midfield")) return "CAM";
  if (p.includes("defensive midfield") || p.includes("central midfield") || p.includes("centre midfield") || p.includes("center midfield")) return "CM";
  if (p.includes("left midfield") || p.includes("left wing")) return "LW";
  if (p.includes("right midfield") || p.includes("right wing")) return "RW";
  if (p.includes("second striker") || p.includes("centre forward") || p.includes("center forward") || p.includes("forward") || p.includes("striker") || p.includes("attack")) return "FW";
  if (p.includes("defender")) return "GENERIC_DF";
  if (p.includes("midfielder")) return "GENERIC_MF";
  return null;
}

export function classifyMainSlot(pos) {
  const raw = classifyRaw(pos);
  if (raw === "GENERIC_DF") return "CB";
  if (raw === "GENERIC_MF") return "CM";
  return raw;
}

// Percent-based position on a portrait pitch (0,0 = top-left), attacking end
// at the top (matches the Tým týdne pitch convention).
export const POSITION_DOT = {
  GK: { top: 90, left: 50 },
  RB: { top: 68, left: 84 },
  CB: { top: 72, left: 50 },
  LB: { top: 68, left: 16 },
  CM: { top: 50, left: 50 },
  CAM: { top: 33, left: 50 },
  RW: { top: 28, left: 84 },
  LW: { top: 28, left: 16 },
  FW: { top: 13, left: 50 },
};
