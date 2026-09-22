"use client";

export default function BackButton() {
  return (
    <button type="button" className="btn-ghost profile-back" onClick={() => window.history.back()}>
      ← Zpět na databázi
    </button>
  );
}
