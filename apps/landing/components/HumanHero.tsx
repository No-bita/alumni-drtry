import Link from "next/link";
import { PLATFORM_URL } from "../content/copy.ts";
import "./HumanHero.css";

/** Direction 2, using the supplied image crop. */
export function HumanHero() {
  return (
    <section className="human-hero" aria-labelledby="human-hero-heading" data-asset-status="supplied-image-crop">
      <div className="human-photo" aria-hidden="true" />
      <div className="human-shade" aria-hidden="true" />
      <header className="human-header">
        <Link href="/" className="human-brand">Alma Mater</Link>
        <nav aria-label="Main" className="human-nav">
          <a href="#vision">Vision</a>
          <a href="#how-heading">How it works</a>
          <a href={PLATFORM_URL}>Log in</a>
        </nav>
        <a href={PLATFORM_URL} className="human-join">Join</a>
      </header>
      <div className="human-content">
        <h1 id="human-hero-heading">Life is unfair.<em>Use your unfair<br className="human-break" /> advantage.</em></h1>
        <p>Find an alum who&apos;s done what you&apos;re trying to do.</p>
        <a href={PLATFORM_URL} className="human-cta">Join Alma Mater <span aria-hidden="true">→</span></a>
      </div>
      <p className="human-audience">Exclusively for IITs and IIMs</p>
    </section>
  );
}
