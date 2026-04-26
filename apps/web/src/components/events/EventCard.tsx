import type { AlumniEvent } from "../../lib/events";
import { RsvpButton } from "./RsvpButton";

type EventCardProps = {
  event: AlumniEvent;
  onOpenDetails: (event: AlumniEvent) => void;
  onToggleRsvp: (eventId: string) => void;
};

function formatEventDay(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

function formatEventTimeRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const startLabel = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const endLabel = end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${startLabel} – ${endLabel}`;
}

export function EventCard({ event, onOpenDetails, onToggleRsvp }: EventCardProps) {
  return (
    <article className="events-card">
      <div className="events-card__head">
        <span className={`events-card__format events-card__format--${event.format}`}>{event.format}</span>
        <span className="events-card__day">{formatEventDay(event.startsAt)}</span>
      </div>
      <h3 className="events-card__title">{event.title}</h3>
      <p className="events-card__meta">
        {formatEventTimeRange(event.startsAt, event.endsAt)} · {event.city ?? "Online"}
      </p>
      <p className="events-card__description">{event.description}</p>
      <div className="events-card__tags">
        {event.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="events-card__tag">
            {tag}
          </span>
        ))}
      </div>
      <button
        type="button"
        className="events-card__details-link"
        onClick={() => onOpenDetails(event)}
        aria-label={`Open details for ${event.title}`}
      >
        View details
      </button>
      <div className="events-card__footer">
        <RsvpButton status={event.rsvpStatus} onToggle={() => onToggleRsvp(event.id)} />
      </div>
    </article>
  );
}
