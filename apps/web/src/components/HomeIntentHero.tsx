import { HomeAskBox } from "./HomeAskBox";
import { HomeReassurance } from "./HomeReassurance";

/** Home hero: one question, one box, and an honest line about who can help. */
export function HomeIntentHero() {
  return (
    <section className="home-ideal__intent-hero" aria-labelledby="home-intent-hero-heading">
      <div className="home-ideal__intent-hero-head">
        <h1 id="home-intent-hero-heading" className="home-ideal__intent-hero-title">
          What do you need <strong className="home-ideal__intent-hero-accent">help with?</strong>
        </h1>
      </div>
      <HomeAskBox />
      <HomeReassurance />
    </section>
  );
}
