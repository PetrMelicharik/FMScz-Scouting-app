"use client";
import { useState } from "react";
import PersonIcon from "./PersonIcon";

export default function Avatar({ src, size = 52, className = "player-avatar" }) {
  const [error, setError] = useState(false);
  if (!src || error) {
    return <div className={className}><PersonIcon size={Math.round(size * 0.5)} /></div>;
  }
  return (
    <div className={`${className} ${className}-photo`} style={{ width: size, height: size }}>
      <img src={src} alt="" onError={() => setError(true)} />
    </div>
  );
}
