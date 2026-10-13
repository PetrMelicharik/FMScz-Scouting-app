"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuthUser } from "../lib/useAuthUser";
import AuthPanel from "./AuthPanel";
import { rowKey, entryMatchesPlayer } from "../lib/shortlist";

export default function ShortlistButton({ player }) {
  const user = useAuthUser();
  const [open, setOpen] = useState(false);
  const [matchIds, setMatchIds] = useState([]); // shortlist rows that refer to this player
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inList = matchIds.length > 0;
  const key = rowKey(player);

  // Matched by the stable player key (name + date of birth), never by the
  // row number — that one shifts whenever the database is updated.
  useEffect(() => {
    if (!user) {
      setChecking(false);
      setMatchIds([]);
      return;
    }
    let cancelled = false;
    setChecking(true);
    supabase
      .from("shortlist_players")
      .select("*")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (cancelled) return;
        setMatchIds((data || []).filter((e) => entryMatchesPlayer(e, player)).map((e) => e.id));
        setChecking(false);
      });
    return () => { cancelled = true; };
  }, [user, key]);

  async function toggle() {
    if (!user) {
      setOpen((o) => !o);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (inList) {
        const { error: delErr } = await supabase
          .from("shortlist_players")
          .delete()
          .eq("user_id", user.id)
          .in("id", matchIds);
        if (delErr) throw delErr;
        setMatchIds([]);
      } else {
        const entry = {
          user_id: user.id,
          player_id: player._id,
          player_key: key,
          player_name: player.player_name,
          club: player["Current Club"] || null,
          league: player.league_name || null,
          position: player.tm_position || player.position || null,
          photo_url: player.photo_url || null,
        };
        let { data, error: insErr } = await supabase.from("shortlist_players").insert(entry).select("id").single();
        // Database not migrated yet (supabase/shortlist-v2.sql) — save without the key.
        if (insErr && /player_key/.test(insErr.message || "")) {
          const { player_key, ...legacy } = entry;
          ({ data, error: insErr } = await supabase.from("shortlist_players").insert(legacy).select("id").single());
        }
        if (insErr) throw insErr;
        setMatchIds([data.id]);
      }
    } catch (e) {
      setError(e.message || "Nepodařilo se uložit — zkus to znovu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`btn-accent shortlist-action-btn${inList ? " shortlist-in" : ""}`}
        onClick={toggle}
        disabled={checking || busy}
      >
        {inList ? "★ V shortlistu" : "☆ Přidat do shortlistu"}
      </button>

      {open && !user && (
        <div className="shortlist-action-panel">
          <AuthPanel onAuthed={() => setOpen(false)} />
        </div>
      )}

      {error && (
        <div className="shortlist-action-panel">
          <p className="chart-note" style={{ color: "#DC2626" }}>{error}</p>
        </div>
      )}
    </>
  );
}
