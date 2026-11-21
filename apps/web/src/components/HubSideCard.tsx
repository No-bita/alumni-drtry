import type { ReactNode } from "react";
import { LineIcon, type LineIconName } from "./LineIcon";
import "../styles/hub-cards.css";

/** A card with an icon, a serif title and an optional action on the right (Careers and Home). */
export function HubSideCard({
  id,
  title,
  icon,
  action,
  tone,
  children,
}: {
  id: string;
  title: string;
  icon: LineIconName;
  action?: ReactNode;
  tone?: "warm";
  children: ReactNode;
}) {
  return (
    <section className={`hub-card${tone === "warm" ? " hub-card--warm" : ""}`} aria-labelledby={id}>
      <div className="hub-card__head">
        <span className="hub-card__icon" aria-hidden>
          <LineIcon name={icon} />
        </span>
        <h2 id={id} className="hub-card__title">
          {title}
        </h2>
        {action ?? null}
      </div>
      {children}
    </section>
  );
}
