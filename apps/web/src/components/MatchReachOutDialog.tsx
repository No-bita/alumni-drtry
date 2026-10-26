import { useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { queryKeys } from "../lib/queryKeys";
import { SENT_NOTES_QUERY_KEY } from "../lib/sentNotes";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useDialogFocusManager } from "../hooks/useDialogFocusManager";
import { CONTACT_NOTE_MAX, CONTACT_NOTE_MIN, defaultReachOutNote, firstName, type MatchCategory } from "../lib/matchApi";
import { Button } from "./Button";


type MatchReachOutDialogProps = {
  recipient: { id: string; fullName: string };
  question: string;
  /** Question category, recorded with the note for the funnel (no question text is stored separately). */
  category: MatchCategory | null;
  onClose: () => void;
};


function sendErrorMessage(code: string | undefined, message: string | undefined): string {
  switch (code) {
    case "DEMO_READ_ONLY":
      return "Demo accounts can’t send notes.";
    case "CONTACT_REQUEST_RATE_LIMITED":
      return "You’ve sent a lot of notes recently. Try again later.";
    case "CONTACT_REQUEST_DUPLICATE_PENDING":
      return message ?? "You already have a note waiting for this alum.";
    case "CONTACT_REQUEST_MESSAGE_TOO_SHORT":
      return `Write at least ${CONTACT_NOTE_MIN} characters.`;
    case "NETWORK_ERROR":
      return message ?? "We couldn't reach the server.";
    default:
      return "Couldn’t send your note. Try again.";
  }
}

/** Reach out from a match: one note via the existing contact-request flow (messaging stays paused). */
export function MatchReachOutDialog({ recipient, question, category, onClose }: MatchReachOutDialogProps) {
  const queryClient = useQueryClient();
  const titleId = useId();
  const noteId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState(() => defaultReachOutNote(recipient.fullName, question));
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  useBodyScrollLock(true);
  useDialogFocusManager({ open: true, containerRef: dialogRef, onClose: status === "sending" ? undefined : onClose });

  const name = firstName(recipient.fullName);
  const tooShort = note.trim().length < CONTACT_NOTE_MIN;

  const send = async () => {
    if (tooShort || status === "sending") return;
    setStatus("sending");
    setError(null);
    const res = await api.post<unknown>("/v1/contact-requests", {
      recipientPersonId: recipient.id,
      message: note.trim(),
      source: "match",
      sourceCategory: category,
    });
    if (res.error) {
      setStatus("idle");
      setError(sendErrorMessage(res.error.code, res.error.message));
      return;
    }
    setStatus("sent");
    // Cards show "Note sent", and Notifications lists it.
    void queryClient.invalidateQueries({ queryKey: queryKeys.match.all });
    void queryClient.invalidateQueries({ queryKey: SENT_NOTES_QUERY_KEY });
  };

  return (
    <div
      className="match-dialog__overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && status !== "sending") onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="match-dialog" ref={dialogRef} tabIndex={-1}>
        {status === "sent" ? (
          <>
            <h2 id={titleId} className="match-dialog__title">
              Note sent to {name}
            </h2>
            <p className="match-dialog__body">
              We’ve emailed your note to {name}. If they accept, we’ll email you their contact address.
            </p>
            <div className="match-dialog__actions">
              <Button variant="primary" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 id={titleId} className="match-dialog__title">
              Reach out to {name}
            </h2>
            <p className="match-dialog__body">
              We’ll email this note to {name}. Their email address stays private unless they accept.
            </p>
            <label htmlFor={noteId} className="match-dialog__label">
              What are you hoping to talk about?
            </label>
            <textarea
              id={noteId}
              className="match-dialog__textarea"
              rows={6}
              value={note}
              maxLength={CONTACT_NOTE_MAX}
              onChange={(e) => setNote(e.target.value)}
              disabled={status === "sending"}
            />
            {error ? (
              <p className="match-dialog__error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="match-dialog__actions">
              <Button variant="back" onClick={onClose} disabled={status === "sending"}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void send()} disabled={tooShort || status === "sending"}>
                {status === "sending" ? "Sending…" : "Send note"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
