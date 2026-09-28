"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/databaze", label: "Databáze" },
  { href: "/grafy", label: "Grafy" },
  { href: "/tym-tydne", label: "Tým týdne" },
  { href: "/porovnani", label: "Porovnání hráčů" },
  { href: "/scouting-tool", label: "Scouting tool" },
  { href: "/shortlist", label: "Shortlist" },
];

export default function NavBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile dropdown whenever the route actually changes (NavBar
  // lives in the root layout, so it stays mounted across navigation).
  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <header className="site-nav">
      <div className="site-nav-inner">
        <Link href="/" className="brand">
          <img src="/logo.jpg" alt="FM Scouts cz" className="brand-logo" />
          <span className="brand-text">
            FM <span className="accent">Scouts</span> <span className="brand-cz">cz</span>
          </span>
        </Link>

        <button
          type="button"
          className="nav-toggle"
          aria-label={open ? "Zavřít menu" : "Otevřít menu"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="nav-toggle-bar" />
          <span className="nav-toggle-bar" />
          <span className="nav-toggle-bar" />
        </button>

        <nav className={open ? "site-links open" : "site-links"}>
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={pathname === l.href ? "site-link active" : "site-link"}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
