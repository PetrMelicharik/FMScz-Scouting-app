"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/databaze", label: "Databáze" },
  { href: "/grafy", label: "Grafy" },
  { href: "/tym-tydne", label: "Tým týdne" },
];

export default function NavBar() {
  const pathname = usePathname();
  return (
    <header className="site-nav">
      <div className="site-nav-inner">
        <Link href="/" className="brand">
          <img src="/logo.jpg" alt="FM Scouts cz" className="brand-logo" />
          <span className="brand-text">
            FM <span className="accent">Scouts</span> <span className="brand-cz">cz</span>
          </span>
        </Link>
        <nav className="site-links">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={pathname === l.href ? "site-link active" : "site-link"}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
