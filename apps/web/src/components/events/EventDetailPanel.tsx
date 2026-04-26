import { Button } from "../Button";
import type { AlumniEvent } from "../../lib/events";
import { RsvpButton } from "./RsvpButton";

type EventDetailPanelProps = {
  event: AlumniEvent | null;
  onClose: () => void;
  onToggleRsvp: (eventId: string) => void;
};

function formatFullDate(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateIso: string): string {
  return new Date(dateIso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function EventDetailPanel({ event, onClose, onToggleRsvp }: EventDetailPanelProps) {
  if (!event) return null;
  return (
    <aside className="events-detail" aria-label="Event details">
      <div className="events-detail__header">
        <p className="events-detail__kicker">Event details</p>
        <button type="button" className="events-detail__close" onClick={onClose} aria-label="Close event details">
          Close
        </button>
      </div>
      <h2 className="events-detail__title">{event.title}</h2>
      <p className="events-detail__datetime">
        {formatFullDate(event.startsAt)} · {formatTime(event.startsAt)} – {formatTime(event.endsAt)}
      </p>
      <p className="events-detail__meta">
        {event.format} · {event.venue}
      </p>
      <p className="events-detail__copy">{event.description}</p>
      <div className="events-detail__stats">
        <p>
          <strong>{event.attendeeCount}</strong> alumni attending
        </p>
        <p>{event.reminderPolicyText}</p>
        <p>Hosted by {event.hostName}</p>
      </div>
      <div className="events-detail__actions">
        <RsvpButton status={event.rsvpStatus} onToggle={() => onToggleRsvp(event.id)} />
        <a href={event.calendarUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="secondary">Add to calendar</Button>
        </a>
      </div>
    </aside>
  );
}
