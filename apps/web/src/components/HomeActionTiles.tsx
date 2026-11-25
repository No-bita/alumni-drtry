import { LineIcon, type LineIconName } from "./LineIcon";

export type HomeTileAction = "career" | "business" | "advice" | "else";

const TILES: ReadonlyArray<{ id: HomeTileAction; title: string; line: string; icon: LineIconName }> = [
  { id: "career", title: "Career help", line: "Referrals, roles, transitions and career advice", icon: "referral" },
  { id: "business", title: "Build a business", line: "Customers, hiring, fundraising and more", icon: "rocket" },
  { id: "advice", title: "Get advice", line: "Discuss ideas, get feedback and learn from experience", icon: "advice" },
  { id: "else", title: "Something else", line: "Any other help, collaboration or opportunity", icon: "compass" },
];

/**
 * Home's four starting points (they replace the Careers and Business pages): Career help and Build a
 * business open the Wall composer at Careers / Startups, Get advice goes to the ask box, Something
 * else opens the composer at General. Phones show titles only, two by two.
 */
export function HomeActionTiles({ onAction }: { onAction: (action: HomeTileAction) => void }) {
  return (
    <nav className="home-tiles" aria-label="What do you need?">
      {TILES.map((t) => (
        <button key={t.id} type="button" className={`home-tile home-tile--${t.id}`} onClick={() => onAction(t.id)}>
          <span className="home-tile__icon" aria-hidden>
            <LineIcon name={t.icon} size={26} />
          </span>
          <span className="home-tile__title">{t.title}</span>
          <span className="home-tile__line">{t.line}</span>
        </button>
      ))}
    </nav>
  );
}
