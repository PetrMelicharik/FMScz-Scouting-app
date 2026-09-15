export const STAT_GROUPS = {
  "Útočné": [
    "goals", "goals_per_90", "min_per_goal", "xg", "xg_per_90", "npxg", "npxg_per_90",
    "assists", "assists_per_90", "min_per_assist", "xa", "xa_per_90",
    "goals_involved_per_90", "shots", "shots_per_90", "shots_on_target",
    "shots_on_target_per_90", "shot_accuraccy_percentage",
  ],
  "Přihrávky": [
    "passes", "passes_per_90", "passes_completed", "passes_completed_per_90",
    "pass_completion_rate", "key_passes", "key_passes_per_90", "crosses",
    "crosses_per_90", "accurate_crosses", "accurate_crosses_per_90",
    "cross_completion_rate",
  ],
  "Driblink": [
    "dribbles", "dribbles_per_90", "dribbles_successful", "dribbles_successful_per_90",
    "dribbled_past", "dribbled_past_per_90",
  ],
  "Obranné": [
    "tackles", "tackles_per_90", "interceptions", "interceptions_per_90",
    "blocks", "blocks_per_90", "clearances", "clearances_per_90",
    "aerial_duels_won", "aerial_duels_won_per_90", "duels", "duels_per_90",
    "duels_won", "duels_won_per_90",
  ],
  "Brankářské": [
    "clean_sheets", "conceded_goals", "conceded_per_90", "saves", "saves_per_90",
    "shots_faced", "shots_faced_per_90", "save_percentage", "punches",
    "punches_per_90", "pens_saved",
  ],
  "Obecné": [
    "appearances", "minutes_played", "avg_rating_",
    "rank_in_league_top_attackers", "rank_in_league_top_midfielders",
    "rank_in_league_top_defenders",
  ],
};

export const STAT_LABELS = {
  goals: "Góly", goals_per_90: "Góly/90", min_per_goal: "Minut na gól",
  xg: "xG", xg_per_90: "xG/90", npxg: "npxG", npxg_per_90: "npxG/90",
  assists: "Asistence", assists_per_90: "Asistence/90", min_per_assist: "Minut na asistenci",
  xa: "xA", xa_per_90: "xA/90", goals_involved_per_90: "G+A/90",
  shots: "Střely", shots_per_90: "Střely/90", shots_on_target: "Střely na branku",
  shots_on_target_per_90: "Střely na branku/90", shot_accuraccy_percentage: "Přesnost střel",
  passes: "Přihrávky", passes_per_90: "Přihrávky/90", passes_completed: "Přesné přihrávky",
  passes_completed_per_90: "Přesné přihrávky/90", pass_completion_rate: "Úspěšnost přihrávek",
  key_passes: "Klíčové přihrávky", key_passes_per_90: "Klíčové přihrávky/90",
  crosses: "Centry", crosses_per_90: "Centry/90", accurate_crosses: "Přesné centry",
  accurate_crosses_per_90: "Přesné centry/90", cross_completion_rate: "Úspěšnost centrů",
  dribbles: "Driblinky", dribbles_per_90: "Driblinky/90",
  dribbles_successful: "Úspěšné driblinky", dribbles_successful_per_90: "Úspěšné driblinky/90",
  dribbled_past: "Obdriblován", dribbled_past_per_90: "Obdriblován/90",
  tackles: "Zákroky", tackles_per_90: "Zákroky/90", interceptions: "Zisky míče",
  interceptions_per_90: "Zisky míče/90", blocks: "Bloky", blocks_per_90: "Bloky/90",
  clearances: "Odkopy", clearances_per_90: "Odkopy/90",
  aerial_duels_won: "Vzdušné souboje vyhrané", aerial_duels_won_per_90: "Vzdušné souboje vyhrané/90",
  duels: "Souboje", duels_per_90: "Souboje/90", duels_won: "Vyhrané souboje",
  duels_won_per_90: "Vyhrané souboje/90",
  clean_sheets: "Čistá konta", conceded_goals: "Obdržené góly",
  conceded_per_90: "Obdržené góly/90", saves: "Zákroky brankáře",
  saves_per_90: "Zákroky brankáře/90", shots_faced: "Střely proti",
  shots_faced_per_90: "Střely proti/90", save_percentage: "Úspěšnost zákroků",
  punches: "Vyražené míče", punches_per_90: "Vyražené míče/90",
  pens_saved: "Chycené penalty",
  appearances: "Zápasy", minutes_played: "Minuty", avg_rating_: "Průměrné hodnocení",
  rank_in_league_top_attackers: "Pořadí v lize (útočníci)",
  rank_in_league_top_midfielders: "Pořadí v lize (záložníci)",
  rank_in_league_top_defenders: "Pořadí v lize (obránci)",
};

export function formatStat(col, val) {
  if (val === null || val === undefined || val === "") return "–";
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  if (col.includes("percentage") || col.includes("rate")) return `${n.toFixed(1)}%`;
  if (col.endsWith("_per_90") || col === "avg_rating_") return n.toFixed(2);
  if (Number.isInteger(n)) return n.toLocaleString("cs-CZ");
  return n.toFixed(2);
}
