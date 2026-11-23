import { useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { queryKeys } from "../lib/queryKeys";
import { SENT_NOTES_QUERY_KEY } from "../lib/sentNotes";
import { CAREERS_KEY } from "../lib/careers";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useDialogFocusManager } from "../hooks/useDialogFocusManager";
import { firstName } from "../lib/matchApi";
import {
  ADVICE_TOPICS,
  ADVICE_TOPIC_HINTS,
  ADVICE_TOPIC_LABELS,
  NOTE_FIT_MAX,
  NOTE_FIT_MIN,
  NOTE_QUESTION_MAX,
  NOTE_QUESTION_MIN,
  NOTE_SHORT_FIELD_MAX,
  NOTE_URL_MAX,
  adviceDetails,
  adviceProblems,
  isWebUrl,
  lengthCounter,
  referralDetails,
  referralProblems,
  type AdviceFields,
  type AdviceTopic,
  type NoteDetails,
  type NotePurpose,
  type ReferralFields,
  noteLabel,
} from "../lib/noteForm";
import { Button } from "./Button";
import { FormActions, FormField } from "./forms";
import { NoteBody } from "./NoteBody";
import "../styles/match.css";

type MatchReachOutDialogProps = {
  recipient: { id: string; fullName: string };
  /** Skip "What do you need?" when the caller already knows (e.g. Careers "Ask for a referral"). */
  purpose?: NotePurpose | null;
  /** Referral prefill: role and company from where the person came from. */
  referral?: { role?: string | null; company?: string | null };
  /** Advice prefill: topic and a starting question (both editable). */
  advice?: { topic?: AdviceTopic | null; question?: string | null };
  /** Position of this person in the results (1 = top), recorded to measure ranking quality. */
  rank?: number | null;
  /** Where the asker came from: the app's search, the WhatsApp bot's "Send a note" link, Careers, or a profile. */
  source?: "match" | "whatsapp" | "careers" | "profile";
  /** After sending: a second way out, e.g. back to Careers. */
  backTo?: { to: string; label: string };
  onClose: () => void;
};

type Step = "purpose" | "fields" | "preview" | "sent";

function sendErrorMessage(code: string | undefined, message: string | undefined): string {
  switch (code) {
    case "DEMO_READ_ONLY":
      return "Demo accounts can’t send reachouts.";
    case "CONTACT_REQUEST_RATE_LIMITED":
      return "You’ve sent a lot of reachouts recently. Try again later.";
    case "CONTACT_REQUEST_DUPLICATE_PENDING":
      return message ?? "You already have a reachout waiting for this alum.";
    case "NETWORK_ERROR":
      return message ?? "We couldn't reach the server.";
    case "CONTACT_REQUEST_BAD_REQUEST":
      // Mid-deploy skew: this dialog already speaks the note form, the server doesn't yet.
      return "Reachouts just got an upgrade. Refresh this page, then send again.";
    default:
      // Field rules come back with their own plain-language message.
      if (code?.startsWith("CONTACT_REQUEST_") && message) return message;
      return "Couldn’t send your reachout. Try again.";
  }
}

/** The note as the recipient will see it: who it's from (with the topic pill beside the name), then its fields. */
function NoteCard({ details, senderName }: { details: NoteDetails; senderName: string }) {
  return (
    <article className="note-card" aria-label="Your reachout">
      <div className="note-card__top">
        <p className="note-card__from">
          <strong>{senderName}</strong>
        </p>
        <span className="note-card__tag">{noteLabel(details)}</span>
      </div>
      <NoteBody details={details} hideTag />
    </article>
  );
}

/** Ask someone for a referral or advice: pick, fill in, preview, send (contact-request flow). */
export function MatchReachOutDialog({
  recipient,
  purpose: presetPurpose = null,
  referral,
  advice,
  rank = null,
  source = "match",
  backTo,
  onClose,
}: MatchReachOutDialogProps) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const titleId = useId();
  const ids = { job: useId(), role: useId(), company: useId(), fit: useId(), resume: useId(), question: useId(), topic: useId(), fitCount: useId(), qCount: useId() };
  const dialogRef = useRef<HTMLDivElement>(null);
  const [purpose, setPurpose] = useState<NotePurpose | null>(presetPurpose);
  const [step, setStep] = useState<Step>("fields");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<ReferralFields>({
    jobUrl: "",
    role: (referral?.role ?? "").slice(0, NOTE_SHORT_FIELD_MAX),
    company: (referral?.company ?? "").slice(0, NOTE_SHORT_FIELD_MAX),
    fit: "",
    resumeUrl: "",
  });
  const [adv, setAdv] = useState<AdviceFields>({
    topic: advice?.topic ?? null,
    question: (advice?.question ?? "").slice(0, NOTE_QUESTION_MAX),
  });

  useBodyScrollLock(true);
  useDialogFocusManager({ open: true, containerRef: dialogRef, onClose: sending ? undefined : onClose });

  const name = firstName(recipient.fullName);
  const me = auth.status === "authenticated" ? auth.myProfile : null;
  const senderName = me?.fullName?.trim() || "You";
  const problems = purpose === "referral" ? referralProblems(ref) : purpose === "advice" ? adviceProblems(adv) : ["topic"];
  const details: NoteDetails | null = problems.length === 0 ? (purpose === "referral" ? referralDetails(ref) : adviceDetails(adv)) : null;

  const send = async () => {
    if (!details || sending) return;
    setSending(true);
    setError(null);
    const note =
      details.purpose === "referral"
        ? { purpose: "referral", jobUrl: details.jobUrl, role: details.role, company: details.company, fit: details.fit, resumeUrl: details.resumeUrl }
        : { purpose: "advice", topic: details.topic, question: details.question };
    const res = await api.post<unknown>("/v1/contact-requests", {
      recipientPersonId: recipient.id,
      note,
      source,
      ...(rank ? { sourceRank: rank } : {}),
    });
    setSending(false);
    if (res.error) {
      setError(sendErrorMessage(res.error.code, res.error.message));
      return;
    }
    setStep("sent");
    // Cards show "Note sent", and Notifications lists it.
    void queryClient.invalidateQueries({ queryKey: queryKeys.match.all });
    void queryClient.invalidateQueries({ queryKey: SENT_NOTES_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: CAREERS_KEY });
  };

  const badJob = ref.jobUrl.trim() !== "" && !isWebUrl(ref.jobUrl);
  const badResume = ref.resumeUrl.trim() !== "" && !isWebUrl(ref.resumeUrl);
  const fitLen = ref.fit.trim().length;
  const qLen = adv.question.trim().length;

  return (
    <div
      className="match-dialog__overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !sending) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="match-dialog" ref={dialogRef} tabIndex={-1}>
        <button type="button" className="match-dialog__close" aria-label="Close" onClick={onClose} disabled={sending}>
          ×
        </button>
        {step === "sent" ? (
          <>
            <h2 id={titleId} className="match-dialog__title">
              Reachout sent to {name}
            </h2>
            <p className="match-dialog__body">
              {name} will see it soon. If they accept, you’ll both see each other’s contact details. If there’s no reply in a few days, we
              send them one reminder.
            </p>
            <div className="match-dialog__actions">
              {backTo ? (
                <Link to={backTo.to} className="match-dialog__link" onClick={onClose}>
                  {backTo.label}
                </Link>
              ) : null}
              <Button variant="primary" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        ) : step === "fields" ? (
          <form
            className="match-dialog__form"
            onSubmit={(e) => {
              e.preventDefault();
              if (details) setStep("preview");
            }}
            onKeyDown={(e) => {
              // Enter advances to Preview (same guarded path as the Preview action);
              // Shift+Enter keeps its native newline in textareas. Selects, buttons and
              // links keep their native Enter behavior, and IME composition is never
              // interrupted. Preview only - Enter can never send from here.
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
              if ((e.target as HTMLElement).closest("button, a, select")) return;
              e.preventDefault();
              if (details) setStep("preview");
            }}
          >
            <h2 id={titleId} className="match-dialog__title">
              Reach out to {name}
            </h2>
            <FormField label="Topic" required>
              <select
                id={ids.topic}
                className="match-dialog__input"
                value={purpose === "referral" ? "referral" : (adv.topic ?? "")}
                required
                onChange={(e) => {
                  const v = e.target.value;
                  setError(null);
                  if (v === "referral") {
                    setPurpose("referral");
                  } else {
                    setPurpose("advice");
                    setAdv({ ...adv, topic: (v || null) as AdviceTopic | null });
                  }
                }}
              >
                <option value="" disabled>
                  Select a topic
                </option>
                <option value="referral">Referral</option>
                {ADVICE_TOPICS.map((t) => (
                  <option key={t} value={t}>
                    {ADVICE_TOPIC_LABELS[t]}
                  </option>
                ))}
              </select>
            </FormField>
            {purpose === "referral" ? (
              <>
                <FormField
                  label="Job link"
                  error={badJob ? "Add the job link, starting with https://." : undefined}
                >
                  <input
                    id={ids.job}
                    className="match-dialog__input"
                    type="url"
                    inputMode="url"
                    placeholder="https://careers.company.com/…"
                    value={ref.jobUrl}
                    maxLength={NOTE_URL_MAX}
                    aria-invalid={badJob}
                    onChange={(e) => setRef({ ...ref, jobUrl: e.target.value })}
                  />
                </FormField>
                <div className="match-dialog__pair">
                  <FormField label="Role" className="match-dialog__field">
                    <input
                      id={ids.role}
                      className="match-dialog__input"
                      value={ref.role}
                      maxLength={NOTE_SHORT_FIELD_MAX}
                      onChange={(e) => setRef({ ...ref, role: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Company" className="match-dialog__field">
                    <input
                      id={ids.company}
                      className="match-dialog__input"
                      value={ref.company}
                      maxLength={NOTE_SHORT_FIELD_MAX}
                      onChange={(e) => setRef({ ...ref, company: e.target.value })}
                    />
                  </FormField>
                </div>
                <FormField label="Why you’re a fit">
                  <textarea
                    id={ids.fit}
                    className="match-dialog__textarea"
                    rows={5}
                    value={ref.fit}
                    maxLength={NOTE_FIT_MAX}
                    placeholder="Your relevant experience in a sentence or two, and what makes you right for this role."
                    aria-describedby={ids.fitCount}
                    onChange={(e) => setRef({ ...ref, fit: e.target.value })}
                  />
                </FormField>
                <p id={ids.fitCount} className="match-dialog__counter" aria-live="polite">
                  {lengthCounter(fitLen, NOTE_FIT_MIN, NOTE_FIT_MAX)}
                </p>
                <FormField
                  label="Résumé link"
                  error={badResume ? "The résumé link must start with https:// (or leave it empty)." : undefined}
                >
                  <input
                    id={ids.resume}
                    className="match-dialog__input"
                    type="url"
                    inputMode="url"
                    placeholder="Drive or Dropbox link"
                    value={ref.resumeUrl}
                    maxLength={NOTE_URL_MAX}
                    aria-invalid={badResume}
                    onChange={(e) => setRef({ ...ref, resumeUrl: e.target.value })}
                  />
                </FormField>
              </>
            ) : (
              <>
                <FormField label="Your question" controlId={ids.question}>
                  <div className="match-dialog__textarea-wrap">
                    <textarea
                      id={ids.question}
                      className="match-dialog__textarea"
                      rows={6}
                      value={adv.question}
                      maxLength={NOTE_QUESTION_MAX}
                      placeholder={adv.topic ? ADVICE_TOPIC_HINTS[adv.topic] : "Pick a topic, then write one specific question."}
                      aria-describedby={ids.qCount}
                      onChange={(e) => setAdv({ ...adv, question: e.target.value })}
                    />
                    <p id={ids.qCount} className="match-dialog__counter match-dialog__counter--inside" aria-live="polite">
                      {lengthCounter(qLen, NOTE_QUESTION_MIN, NOTE_QUESTION_MAX)}
                    </p>
                  </div>
                </FormField>
              </>
            )}
            <FormActions
              secondary={{ label: "Cancel", onClick: onClose }}
              primary={{ label: "Preview", disabled: !details, onClick: () => { if (details) setStep("preview"); } }}
            />
          </form>
        ) : details ? (
          <>
            <h2 id={titleId} className="match-dialog__title">
              Reach out to {name}
            </h2>
            <p className="match-dialog__eyebrow">Preview</p>
            <NoteCard details={details} senderName={senderName} />
            {error ? (
              <p className="match-dialog__error" role="alert">
                {error}
              </p>
            ) : null}
            <FormActions
              secondary={{ label: "Edit", onClick: () => setStep("fields"), disabled: sending }}
              primary={{ label: sending ? "Sending…" : "Send", disabled: sending, onClick: () => void send() }}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
