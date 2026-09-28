"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuthUser } from "../lib/useAuthUser";
import AuthPanel from "./AuthPanel";

export default function ShortlistButton({ player }) {
  const user = useAuthUser();
  const [open, setOpen] = useState(false);
  const [inList, setInList] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      setChecking(false);
      setInList(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    supabase
      .from("shortlist_players")
      .select("id")
      .eq("user_id", user.id)
      .eq("player_id", player._id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setInList(!!data);
          setChecking(false);
        }
      });
    return () => { cancelled = true; };
  }, [user, player._id]);

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
          .eq("player_id", player._id);
        if (delErr) throw delErr;
        setInList(false);
      } else {
        const { error: insErr } = await supabase.from("shortlist_players").insert({
          user_id: user.id,
          player_id: player._id,
          player_name: player.player_name,
          club: player["Current Club"] || null,
          league: player.league_name || null,
          position: player.tm_position || player.position || null,
          photo_url: player.photo_url || null,
        });
        if (insErr) throw insErr;
        setInList(true);
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
