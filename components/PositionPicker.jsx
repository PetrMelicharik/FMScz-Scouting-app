"use client";
import React from "react";
import { SPECIFIC_POSITIONS } from "../lib/positions";

// Výběr konkrétních pozic (lze zvolit několik) + zaškrtávátko, zda se má
// hledat i ve vedlejších pozicích hráče. Používá Databáze i Scouting tool.
// options = které pozice nabídnout (výchozí všechny).
export default function PositionPicker({ value, onChange, includeOther, onIncludeOtherChange, options = SPECIFIC_POSITIONS, hint }) {
  const toggle = (p) => onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p]);
  return (
    <div className="field" style={{ marginTop: 12 }}>
      <div className="field-label">Konkrétní pozice{hint ? ` ${hint}` : ""}</div>
      <div className="chip-row">
        {options.map(([v, label]) => (
          <button
            key={v}
            type="button"
            title={v}
            className={value.includes(v) ? "chip active" : "chip"}
            onClick={() => toggle(v)}
          >
            {label}
          </button>
        ))}
      </div>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 13, cursor: "pointer" }}>
        <input type="checkbox" checked={includeOther} onChange={(e) => onIncludeOtherChange(e.target.checked)} />
        včetně vedlejších pozic
      </label>
    </div>
  );
}
