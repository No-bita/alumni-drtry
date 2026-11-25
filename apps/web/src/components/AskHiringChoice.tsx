import { LineIcon, type LineIconName } from "./LineIcon";

export type AskHiringAction = "share" | "find" | "recommend";

const OPTIONS: ReadonlyArray<{ id: AskHiringAction; title: string; line: string; icon: LineIconName; soon?: boolean }> = [
  { id: "share", title: "Share the role", line: "Post it on the Wall. You can also privately ask matching alumni.", icon: "wall" },
  { id: "find", title: "Find candidates", line: "See alumni who do this role, and reach out or ask them privately.", icon: "people" },
  { id: "recommend", title: "Ask alumni to recommend people", line: "Coming soon", icon: "referral", soon: true },
];

/** "a Product Manager role", "an Investment Banker role". */
function roleWithArticle(role: string): string {
  return `${/^[aeiou]/i.test(role) ? "an" : "a"} ${role} role`;
}

/**
 * Ask recognised a hiring question: instead of a people list, the hirer picks what they want to do.
 * Recommending people is shown but not available yet (approved: coming soon).
 */
export function AskHiringChoice({ role, onPick }: { role: string; onPick: (action: AskHiringAction) => void }) {
  return (
    <section className="ask-hiring" aria-labelledby="ask-hiring-title">
      <h2 id="ask-hiring-title" className="ask-hiring__question">
        Looks like you&apos;re hiring for {roleWithArticle(role)}. What would you like to do?
      </h2>
      <div className="ask-hiring__options">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`ask-hiring__option${o.soon ? " ask-hiring__option--soon" : ""}`}
            disabled={o.soon}
            onClick={() => onPick(o.id)}
          >
            <span className="ask-hiring__icon" aria-hidden>
              <LineIcon name={o.icon} size={22} />
            </span>
            <span className="ask-hiring__title">{o.title}</span>
            <span className="ask-hiring__line">{o.line}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
