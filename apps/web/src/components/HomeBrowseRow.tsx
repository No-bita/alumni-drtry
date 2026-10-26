import { Link } from "react-router-dom";
import { isBuildIntentPageEnabled } from "../lib/buildIntentPage";

const LINKS = [
  { id: "careers", label: "Careers", to: "/intent/career" },
  { id: "cities", label: "Cities", to: "/intent/location" },
  { id: "startups", label: "Startups", to: "/intent/build" },
  { id: "directory", label: "All alumni", to: "/search" },
] as const;

/** Quiet secondary paths under the ask (replaces the five big cards). */
export function HomeBrowseRow() {
  const links = isBuildIntentPageEnabled ? LINKS : LINKS.filter((l) => l.id !== "startups");
  return (
    <nav className="home-browse" aria-label="Browse">
      <span className="home-browse__label">Or browse:</span>
      {links.map((l) => (
        <Link key={l.id} to={l.to} className="home-browse__link">
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
