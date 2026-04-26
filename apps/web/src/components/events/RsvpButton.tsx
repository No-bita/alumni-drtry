import { Button } from "../Button";
import type { EventRsvpStatus } from "../../lib/events";

type RsvpButtonProps = {
  status: EventRsvpStatus;
  disabled?: boolean;
  onToggle: () => void;
};

export function RsvpButton({ status, disabled = false, onToggle }: RsvpButtonProps) {
  if (status === "going") {
    return (
      <Button
        variant="secondary"
        disabled={disabled}
        onClick={onToggle}
        aria-label="Cancel RSVP"
        className="events-rsvp-button"
      >
        Going
      </Button>
    );
  }
  return (
    <Button
      variant="primary"
      disabled={disabled}
      onClick={onToggle}
      aria-label="RSVP to event"
      className="events-rsvp-button"
    >
      RSVP
    </Button>
  );
}
