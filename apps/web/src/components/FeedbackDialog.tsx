import { useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useDialogFocusManager } from "../hooks/useDialogFocusManager";
import { NETWORK_ERROR_MESSAGE } from "../api/client";
import { Button } from "./Button";
import { FormActions, FormField } from "./forms";
import { adminFeedbackQueryKey, submitFeedback } from "../lib/feedbackApi";
import "../styles/feedback.css";

type FeedbackDialogProps = {
  onClose: () => void;
};

const MAX_MESSAGE = 3000;

/**
 * In-app feedback form (replaces the WhatsApp feedback link in the nav). Message only.
 * The member's account is attached so admins can follow up: the copy says private, never
 * anonymous. Admins read submissions on the analytics screen.
 */
export function FeedbackDialog({ onClose }: FeedbackDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useBodyScrollLock(true);
  useDialogFocusManager({ open: true, containerRef: dialogRef, onClose: sending ? undefined : onClose });

  const trimmed = message.trim();

  const submit = async () => {
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    const res = await submitFeedback(trimmed);
    setSending(false);
    if (res.error) {
      setError(res.error.code === "NETWORK_ERROR" ? NETWORK_ERROR_MESSAGE : res.error.message ?? "Could not send your feedback. Try again in a moment.");
      return;
    }
    setSent(true);
    void queryClient.invalidateQueries({ queryKey: adminFeedbackQueryKey });
  };

  return (
    <div
      className="feedback-dialog__overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !sending) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="feedback-dialog" ref={dialogRef} tabIndex={-1}>
        <button type="button" className="feedback-dialog__close" aria-label="Close" onClick={onClose} disabled={sending}>
          ×
        </button>
        {sent ? (
          <>
            <h2 id={titleId} className="feedback-dialog__title">
              Feedback sent
            </h2>
            <p className="feedback-dialog__body">Thanks for sharing. We read every note.</p>
            <div className="feedback-dialog__actions">
              <Button variant="primary" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <form
            className="feedback-dialog__form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <h2 id={titleId} className="feedback-dialog__title">
              Feedback
            </h2>
            <FormField
              label="What's on your mind?"
              required
              help="Your feedback is private."
              error={error}
            >
              <textarea
                className="input"
                rows={5}
                maxLength={MAX_MESSAGE}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us what worked, what didn't, or what's missing."
              />
            </FormField>
            <FormActions
              secondary={{ label: "Cancel", onClick: onClose, disabled: sending }}
              primary={{ label: "Send feedback", onClick: () => void submit(), disabled: !trimmed, busy: sending }}
            />
          </form>
        )}
      </div>
    </div>
  );
}
