"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "./Avatar";

function simColor(sim) {
  return sim >= 85 ? "#4CB848" : sim >= 70 ? "#D97706" : "#DC2626";
}

export default function SimilarPlayers({ data }) {
  const [open, setOpen] = useState(false);

  if (!data || data.insufficient || !data.results || data.results.length === 0) return null;

  return (
    <div className="profile-group">
      <div className="profile-group-title">Podobní hráči</div>

      <button type="button" className="chip" onClick={() => setOpen((v) => !v)}>
        {open ? "Skrýt podobné hráče" : "🔍 Najít podobné hráče"}
      </button>

      {open && (
        <>
          <div className="week-list" style={{ marginTop: 12 }}>
            {data.results.map(({ player: sp, similarity }) => (
              <Link href={`/databaze/${sp._id}`} className="week-row" key={sp._id}>
                <Avatar src={sp.photo_url} size={40} className="week-avatar" />
                <div className="week-info">
                  <div className="week-name">{sp.player_name}</div>
                  <div className="week-sub">
                    {sp.club_logo_url && <img src={sp.club_logo_url} alt="" className="mini-inline-logo" />}
                    {sp["Current Club"] || "–"} · {sp.league_name || "–"}
                    {sp.market_value ? ` · ${sp.market_value}` : ""}
                  </div>
                </div>
                <div className="week-rating-badge" style={{ background: simColor(similarity) }}>{similarity}%</div>
              </Link>
            ))}
          </div>
          <p className="chart-note">
            Shoda podle percentilového profilu hráčů ve skupině „{data.groupLabel}" napříč ligami (statistiky na 90 minut), min. 300 odehraných minut.
          </p>
        </>
      )}
    </div>
  );
}
