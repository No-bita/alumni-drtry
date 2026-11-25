import type { Ref } from "react";
import { HomeAskBox } from "./HomeAskBox";
import campusArt from "../assets/home-campus.jpg";
// Temporarily hidden: the "N alumni across N companies" line. Component and API are kept.
// import { HomeReassurance } from "./HomeReassurance";

/** Home hero: one question, a line on what Alma Mater is for, the ask box, and the campus in the corner. */
export function HomeIntentHero({ askInputRef }: { askInputRef?: Ref<HTMLInputElement> } = {}) {
  return (
    <section className="home-ideal__intent-hero home-hero" aria-labelledby="home-intent-hero-heading">
      <div className="home-hero__art" style={{ backgroundImage: `url(${campusArt})` }} aria-hidden />
      <div className="home-ideal__intent-hero-head">
        <h1 id="home-intent-hero-heading" className="home-ideal__intent-hero-title">
          How can Alma Mater <strong className="home-ideal__intent-hero-accent">help you?</strong>
        </h1>
        <p className="home-hero__lede">Find the right people, opportunities and help from the alumni community.</p>
      </div>
      <HomeAskBox inputRef={askInputRef} />
      {/* <HomeReassurance /> */}
    </section>
  );
}
