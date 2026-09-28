"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Avatar from "./Avatar";
import AuthPanel from "./AuthPanel";
import { supabase } from "../lib/supabaseClient";
import { useAuthUser } from "../lib/useAuthUser";

export default function ShortlistView() {
  const user = useAuthUser();
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user === undefined) return; // still resolving the session
    if (!user) {
      setRows(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("shortlist_players")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        else setRows(data);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user]);

  async function remove(id) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    const { error: err } = await supabase.from("shortlist_players").delete().eq("id", id);
    if (err) setError(err.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <div>
      <div className="db-header">
        <h1 className="db-title">Shortlist</h1>
        <p className="db-subtitle">Tvůj osobní seznam sledovaných hráčů — přidáš je tlačítkem na profilu hráče.</p>
      </div>

      {user === undefined && (
        <div className="empty-state">
          <div className="empty-title">Načítám…</div>
        </div>
      )}

      {user === null && (
        <div className="filter-panel" style={{ maxWidth: 420 }}>
          <AuthPanel />
        </div>
      )}

      {user && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <span className="field-label" style={{ marginBottom: 0 }}>{user.email}</span>
            <button type="button" className="btn" onClick={signOut}>Odhlásit se</button>
          </div>

          {error && (
            <div className="empty-state" style={{ marginBottom: 16 }}>
              <div className="empty-title">Chyba</div>
              <div className="empty-sub">{error}</div>
            </div>
          )}

          {loading && (
            <div className="empty-state">
              <div className="empty-title">Načítám shortlist…</div>
            </div>
          )}

          {!loading && rows && rows.length === 0 && (
            <div className="empty-state">
              <div className="empty-title">Shortlist je zatím prázdný</div>
              <div className="empty-sub">Přidej hráče tlačítkem "Přidat do shortlistu" na jeho profilu.</div>
            </div>
          )}

          {!loading && rows && rows.length > 0 && (
            <div className="week-list">
              {rows.map((r) => (
                <div className="week-row" key={r.id}>
                  <Link href={`/databaze/${r.player_id}`} className="shortlist-row-link">
                    <Avatar src={r.photo_url} size={40} className="week-avatar" />
                    <div className="week-info">
                      <div className="week-name">{r.player_name}</div>
                      <div className="week-sub">{[r.club, r.league].filter(Boolean).join(" · ") || "–"}</div>
                    </div>
                  </Link>
                  <button type="button" className="btn-ghost" onClick={() => remove(r.id)}>Odebrat</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
