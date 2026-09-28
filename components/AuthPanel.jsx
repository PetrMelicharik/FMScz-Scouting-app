"use client";
import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function AuthPanel({ onAuthed }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setInfo("");
    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        onAuthed && onAuthed();
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        if (data.session) {
          onAuthed && onAuthed();
        } else {
          setInfo("Účet vytvořen. Pokud appka vyžaduje potvrzení e-mailu, zkontroluj schránku a pak se přihlas.");
        }
      }
    } catch (e2) {
      setError(e2.message || "Něco se nepovedlo, zkus to znovu.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-panel">
      <div className="chip-row" style={{ marginBottom: 12 }}>
        <button type="button" className={mode === "signin" ? "chip active" : "chip"} onClick={() => setMode("signin")}>
          Přihlásit se
        </button>
        <button type="button" className={mode === "signup" ? "chip active" : "chip"} onClick={() => setMode("signup")}>
          Registrovat
        </button>
      </div>
      <form onSubmit={submit} className="auth-form">
        <div className="field">
          <div className="field-label">E-mail</div>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tvuj@email.cz" />
        </div>
        <div className="field">
          <div className="field-label">Heslo</div>
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min. 6 znaků" />
        </div>
        {error && <p className="chart-note" style={{ color: "#DC2626" }}>{error}</p>}
        {info && <p className="chart-note" style={{ color: "#2563EB" }}>{info}</p>}
        <button type="submit" className="btn-accent" disabled={submitting} style={{ alignSelf: "flex-start" }}>
          {submitting ? "Chvilku…" : mode === "signin" ? "Přihlásit se" : "Vytvořit účet"}
        </button>
      </form>
    </div>
  );
}
