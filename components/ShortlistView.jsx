"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Avatar from "./Avatar";
import AuthPanel from "./AuthPanel";
import { supabase } from "../lib/supabaseClient";
import { useAuthUser } from "../lib/useAuthUser";
import { formatStat } from "../lib/statMeta";
import { flagUrl } from "../lib/countryFlags";

const SORT_OPTIONS = [
  ["created_at", "Datum přidání"],
  ["age", "Věk"],
  ["avg_rating_", "Rating"],
  ["goals", "Góly"],
  ["assists", "Asistence"],
];

export default function ShortlistView() {
  const user = useAuthUser();
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Extra per-player data the shortlist table itself doesn't store (age,
  // nationality, rating, goals, assists) — looked up from the same dataset
  // the rest of the app uses, keyed by player_id (== players.json row _id).
  const [playersById, setPlayersById] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/players.json", { cache: "no-store" })
      .then((res) => res.json())
      .then((payload) => {
        if (cancelled) return;
        const cols = payload.columns;
        const map = new Map();
        payload.rows.forEach((r, i) => {
          const o = {};
          cols.forEach((c, ci) => { o[c] = r[ci]; });
          map.set(i, o);
        });
        setPlayersById(map);
      })
      .catch(() => { if (!cancelled) setPlayersById(new Map()); });
    return () => { cancelled = true; };
  }, []);

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

  // Shortlist rows enriched with age/nationality/rating/goals/assists from
  // players.json, when that's loaded; falls back to "–" otherwise.
  const enriched = useMemo(() => {
    if (!rows) return [];
    return rows.map((r) => {
      const p = playersById ? playersById.get(r.player_id) : null;
      return {
        ...r,
        age: p?.age ?? null,
        nationality: p?.nationality || "",
        avg_rating_: p?.avg_rating_ ?? null,
        goals: p?.goals ?? null,
        assists: p?.assists ?? null,
      };
    });
  }, [rows, playersById]);

  const positions = useMemo(
    () => [...new Set(enriched.map((r) => r.position).filter(Boolean))].sort(),
    [enriched]
  );
  const leagues = useMemo(
    () => [...new Set(enriched.map((r) => r.league).filter(Boolean))].sort(),
    [enriched]
  );
  const ageDomain = useMemo(() => {
    let min = Infinity, max = -Infinity;
    enriched.forEach((r) => {
      if (typeof r.age === "number" && !Number.isNaN(r.age)) {
        if (r.age < min) min = r.age;
        if (r.age > max) max = r.age;
      }
    });
    return Number.isFinite(min) ? [min, max] : [14, 45];
  }, [enriched]);

  const [filters, setFilters] = useState({
    text: "", position: "", league: "", nationality: "", ageMin: null, ageMax: null,
  });
  const [sortState, setSortState] = useState({ key: "created_at", dir: "desc" });

  // Restore filters/sort from the URL on first load, and keep the URL in
  // sync afterwards — so going to a player's profile and back (or any other
  // page and back) returns to the same filtered/sorted shortlist instead of
  // a reset one.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if ([...params.keys()].length === 0) return;
    setFilters({
      text: params.get("q") || "",
      position: params.get("pos") || "",
      league: params.get("league") || "",
      nationality: params.get("nat") || "",
      ageMin: params.has("ageMin") ? Number(params.get("ageMin")) : null,
      ageMax: params.has("ageMax") ? Number(params.get("ageMax")) : null,
    });
    if (params.has("sort") || params.has("dir")) {
      setSortState((s) => ({ key: params.get("sort") || s.key, dir: params.get("dir") || s.dir }));
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.text) params.set("q", filters.text);
    if (filters.position) params.set("pos", filters.position);
    if (filters.league) params.set("league", filters.league);
    if (filters.nationality) params.set("nat", filters.nationality);
    if (filters.ageMin !== null) params.set("ageMin", String(filters.ageMin));
    if (filters.ageMax !== null) params.set("ageMax", String(filters.ageMax));
    if (sortState.key !== "created_at") params.set("sort", sortState.key);
    if (sortState.dir !== "desc") params.set("dir", sortState.dir);
    const qs = params.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [filters, sortState]);

  const ageMinValue = filters.ageMin ?? ageDomain[0];
  const ageMaxValue = filters.ageMax ?? ageDomain[1];

  const filtered = useMemo(() => {
    return enriched.filter((r) => {
      if (filters.text && !(r.player_name || "").toLowerCase().includes(filters.text.toLowerCase())) return false;
      if (filters.position && r.position !== filters.position) return false;
      if (filters.league && r.league !== filters.league) return false;
      if (filters.nationality && !(r.nationality || "").toLowerCase().includes(filters.nationality.toLowerCase())) return false;
      if (filters.ageMin !== null && (r.age ?? -Infinity) < filters.ageMin) return false;
      if (filters.ageMax !== null && (r.age ?? Infinity) > filters.ageMax) return false;
      return true;
    });
  }, [enriched, filters]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va = a[sortState.key], vb = b[sortState.key];
      if (sortState.key === "created_at") {
        va = va ? new Date(va).getTime() : -Infinity;
        vb = vb ? new Date(vb).getTime() : -Infinity;
      } else {
        va = va === null || va === undefined ? -Infinity : Number(va);
        vb = vb === null || vb === undefined ? -Infinity : Number(vb);
      }
      const cmp = va - vb;
      return sortState.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortState]);

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
            <>
              <div className="filter-panel">
                <div className="filter-grid">
                  <div className="field">
                    <div className="field-label">Jméno hráče</div>
                    <input type="text" value={filters.text} onChange={(e) => setFilters((f) => ({ ...f, text: e.target.value }))} placeholder="např. Kanté" />
                  </div>
                  <div className="field">
                    <div className="field-label">Pozice</div>
                    <select value={filters.position} onChange={(e) => setFilters((f) => ({ ...f, position: e.target.value }))}>
                      <option value="">Všechny pozice</option>
                      {positions.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <div className="field-label">Liga</div>
                    <select value={filters.league} onChange={(e) => setFilters((f) => ({ ...f, league: e.target.value }))}>
                      <option value="">Všechny ligy</option>
                      {leagues.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <div className="field-label">Národnost</div>
                    <input type="text" value={filters.nationality} onChange={(e) => setFilters((f) => ({ ...f, nationality: e.target.value }))} placeholder="národnost" />
                  </div>
                </div>

                <div className="field" style={{ marginBottom: 0 }}>
                  <div className="field-label">Věk: {ageMinValue} – {ageMaxValue}</div>
                  <div className="dual-slider">
                    <div className="dual-slider-col">
                      <span className="dual-slider-tag">od</span>
                      <input
                        type="range" min={ageDomain[0]} max={ageDomain[1]} value={ageMinValue}
                        onChange={(e) => { const v = Number(e.target.value); setFilters((f) => ({ ...f, ageMin: Math.min(v, f.ageMax ?? ageDomain[1]) })); }}
                      />
                    </div>
                    <div className="dual-slider-col">
                      <span className="dual-slider-tag">do</span>
                      <input
                        type="range" min={ageDomain[0]} max={ageDomain[1]} value={ageMaxValue}
                        onChange={(e) => { const v = Number(e.target.value); setFilters((f) => ({ ...f, ageMax: Math.max(v, f.ageMin ?? ageDomain[0]) })); }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                <div className="field-label" style={{ marginBottom: 0 }}>
                  {sorted.length} {sorted.length === 1 ? "hráč" : "hráčů"} odpovídá filtru (z {rows.length} na shortlistu)
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <select value={sortState.key} onChange={(e) => setSortState((s) => ({ ...s, key: e.target.value }))} style={{ width: "auto" }}>
                    {SORT_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <button className="btn" onClick={() => setSortState((s) => ({ ...s, dir: s.dir === "desc" ? "asc" : "desc" }))}>
                    {sortState.dir === "desc" ? "↓ sestupně" : "↑ vzestupně"}
                  </button>
                </div>
              </div>

              {sorted.length > 0 ? (
                <div className="week-list">
                  {sorted.map((r) => (
                    <div className="week-row" key={r.id}>
                      <Link href={`/databaze/${r.player_id}`} className="shortlist-row-link">
                        <Avatar src={r.photo_url} size={40} className="week-avatar" />
                        <div className="week-info">
                          <div className="week-name">{r.player_name}</div>
                          <div className="week-sub">
                            {[r.position, r.club, r.league].filter(Boolean).join(" · ") || "–"}
                          </div>
                        </div>
                        <div className="week-sub" style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          {flagUrl(r.nationality) && (
                            <img src={flagUrl(r.nationality)} alt="" className="flag-mini" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                          )}
                          {r.age ? `${r.age} let` : ""}
                        </div>
                      </Link>
                      {typeof r.avg_rating_ === "number" && (
                        <div className="week-rating-badge" style={{ background: "#4CB848" }}>{formatStat("avg_rating_", r.avg_rating_)}</div>
                      )}
                      <button type="button" className="btn-ghost" onClick={() => remove(r.id)}>Odebrat</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-title">Žádný hráč neodpovídá filtru</div>
                  <div className="empty-sub">Zkus filtry uvolnit nebo rozšířit.</div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
