import type { HomeQuickAction } from "./HomeQuickActions";
import { HomeQuickActionCards } from "./HomeQuickActions";

type HomeIntentHeroProps = {
  actions: HomeQuickAction[];
};

export function HomeIntentHero({ actions }: HomeIntentHeroProps) {
  return (
    <section className="home-ideal__intent-hero" aria-labelledby="home-intent-hero-heading">
      <div className="home-ideal__intent-hero-head">
        <h1 id="home-intent-hero-heading" className="home-ideal__intent-hero-title">
          What do you want to do{" "}
          <strong className="home-ideal__intent-hero-accent">right now?</strong>
        </h1>
      </div>
      <HomeQuickActionCards actions={actions} variant="intentHero" />
    </section>
  );
}
