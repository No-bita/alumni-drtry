import type { OccupationView, PublicProfileView } from "../../api/client";
import { sortOccupationsForDisplay } from "../../lib/profileDisplay";

type Props = {
  loading: boolean;
  profile: PublicProfileView | null | undefined;
  occupations: OccupationView[];
};

/** Use only saved biography and occupation facts, never an inferred personal summary. */
export function ProfilePortrait({ loading, profile, occupations }: Props) {
  if (loading) return null;
  const bio = profile?.bio?.trim();
  const sorted = sortOccupationsForDisplay(occupations);
  const current = sorted.find((item) => item.isCurrent);
  const previous = sorted.find((item) => !item.isCurrent);
  return (
    <>
      {bio ? (
        <section className="profile-portrait__voice" aria-labelledby="profile-voice-title">
          <h2 id="profile-voice-title">In their words</h2>
          <p>{bio}</p>
        </section>
      ) : null}
      {current || previous ? (
        <section className="profile-portrait__context" aria-label="Work context">
          {[{ label: "Today", item: current }, { label: current ? "Before that" : "Previously", item: previous }].map(({ label, item }) => item ? (
            <div key={label}>
              <h2>{label}</h2>
              <p>{item.roleTitle}</p>
              {item.organizationName ? <span>{item.organizationName}</span> : null}
            </div>
          ) : null)}
        </section>
      ) : null}
    </>
  );
}
