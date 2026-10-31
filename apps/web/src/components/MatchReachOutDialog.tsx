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
  batchLabel,
  isWebUrl,
  lengthCounter,
  referralDetails,
  referralProblems,
  type AdviceFields,
  type AdviceTopic,
  type NoteDetails,
  type NotePurpose,
  type ReferralFields,
} from "../lib/noteForm";
import { Button } from "./Button";
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
  /** Where the asker came from: the app's search, the WhatsApp bot's "Send a note" link, or Careers. */
  source?: "match" | "whatsapp" | "careers";
  /** After sending: a second way out, e.g. back to Careers. */
  backTo?: { to: string; label: string };
  onClose: () => void;
};

type Step = "purpose" | "fields" | "preview" | "sent";

function sendErrorMessage(code: string | undefined, message: string | undefined): string {
  switch (code) {
    case "DEMO_READ_ONLY":
      return "Demo accounts can’t send notes.";
    case "CONTACT_REQUEST_RATE_LIMITED":
      return "You’ve sent a lot of notes recently. Try again later.";
    case "CONTACT_REQUEST_DUPLICATE_PENDING":
      return message ?? "You already have a note waiting for this alum.";
    case "NETWORK_ERROR":
      return message ?? "We couldn't reach the server.";
    case "CONTACT_REQUEST_BAD_REQUEST":
      // Mid-deploy skew: this dialog already speaks the note form, the server doesn't yet.
      return "Notes just got an upgrade. Refresh this page, then send again.";
    default:
      // Field rules come back with their own plain-language message.
      if (code?.startsWith("CONTACT_REQUEST_") && message) return message;
      return "Couldn’t send your note. Try again.";
  }
}

/** The note as the recipient will see it: who it's from, then its label and fields. */
function NoteCard({ details, senderName, senderBatch }: { details: NoteDetails; senderName: string; senderBatch: string }) {
  return (
    <article className="note-card" aria-label="Your note">
      <p className="note-card__from">
        <strong>{senderName}</strong>
        {senderBatch ? <span> · {senderBatch}</span> : null}
      </p>
      <NoteBody details={details} />
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
  const ids = { job: useId(), role: useId(), company: useId(), fit: useId(), resume: useId(), question: useId(), fitCount: useId(), qCount: useId() };
  const dialogRef = useRef<HTMLDivElement>(null);
  const [purpose, setPurpose] = useState<NotePurpose | null>(presetPurpose);
  const [step, setStep] = useState<Step>(presetPurpose ? "fields" : "purpose");
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
  const senderBatch = batchLabel(me?.batchYear);
  const problems = purpose === "referral" ? referralProblems(ref) : purpose === "advice" ? adviceProblems(adv) : ["purpose"];
  const details: NoteDetails | null = problems.length === 0 ? (purpose === "referral" ? referralDetails(ref) : adviceDetails(adv)) : null;

  const choose = (p: NotePurpose) => {
    setPurpose(p);
    setStep("fields");
    setError(null);
  };

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
        {step === "sent" ? (
          <>
            <h2 id={titleId} className="match-dialog__title">
              Note sent to {name}
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
        ) : step === "purpose" ? (
          <>
            <h2 id={titleId} className="match-dialog__title">
              What do you need from {name}?
            </h2>
            <div className="match-dialog__choices">
              <button type="button" className="match-dialog__choice" onClick={() => choose("referral")}>
                <span className="match-dialog__choice-title">Ask for a referral</span>
                <span className="match-dialog__choice-copy">For a specific opening. You’ll need the job link, the role, and why you’re a fit.</span>
              </button>
              <button type="button" className="match-dialog__choice" onClick={() => choose("advice")}>
                <span className="match-dialog__choice-title">Ask for advice</span>
                <span className="match-dialog__choice-copy">
                  Interviews, switching careers, higher studies, moving cities, starting up. You’ll write one specific question.
                </span>
              </button>
            </div>
            <p className="match-dialog__hint">Alumni get many notes. A clear, specific ask is easier to say yes to.</p>
            <div className="match-dialog__actions">
              <Button variant="back" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </>
        ) : step === "fields" && purpose === "referral" ? (
          <form
            className="match-dialog__form"
            onSubmit={(e) => {
              e.preventDefault();
              if (details) setStep("preview");
            }}
          >
            <p className="match-dialog__step">Step 1 of 2</p>
            <h2 id={titleId} className="match-dialog__title">
              Ask {name} for a referral
            </h2>
            <label htmlFor={ids.job} className="match-dialog__label">
              Job link
            </label>
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
            {badJob ? (
              <p className="match-dialog__error" role="alert">
                Add the job link, starting with https://.
              </p>
            ) : null}
            <button type="button" className="match-dialog__textlink" onClick={() => choose("advice")}>
              No specific opening? Ask for advice instead
            </button>
            <div className="match-dialog__pair">
              <div className="match-dialog__field">
                <label htmlFor={ids.role} className="match-dialog__label">
                  Role
                </label>
                <input
                  id={ids.role}
                  className="match-dialog__input"
                  value={ref.role}
                  maxLength={NOTE_SHORT_FIELD_MAX}
                  onChange={(e) => setRef({ ...ref, role: e.target.value })}
                />
              </div>
              <div className="match-dialog__field">
                <label htmlFor={ids.company} className="match-dialog__label">
                  Company
                </label>
                <input
                  id={ids.company}
                  className="match-dialog__input"
                  value={ref.company}
                  maxLength={NOTE_SHORT_FIELD_MAX}
                  onChange={(e) => setRef({ ...ref, company: e.target.value })}
                />
              </div>
            </div>
            <label htmlFor={ids.fit} className="match-dialog__label">
              Why you’re a fit
            </label>
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
            <p id={ids.fitCount} className="match-dialog__counter" aria-live="polite">
              {lengthCounter(fitLen, NOTE_FIT_MIN, NOTE_FIT_MAX)}
            </p>
            <label htmlFor={ids.resume} className="match-dialog__label">
              Résumé link <span className="match-dialog__optional">(optional)</span>
            </label>
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
            {badResume ? (
              <p className="match-dialog__error" role="alert">
                The résumé link must start with https:// (or leave it empty).
              </p>
            ) : null}
            {details ? null : <p className="match-dialog__hint">Still needed: {problems.join(", ")}.</p>}
            <div className="match-dialog__actions">
              <Button type="button" variant="back" onClick={() => (presetPurpose ? onClose() : setStep("purpose"))}>
                {presetPurpose ? "Cancel" : "Back"}
              </Button>
              <Button type="submit" variant="primary" disabled={!details}>
                Preview your note
              </Button>
            </div>
          </form>
        ) : step === "fields" ? (
          <form
            className="match-dialog__form"
            onSubmit={(e) => {
              e.preventDefault();
              if (details) setStep("preview");
            }}
          >
            <p className="match-dialog__step">Step 1 of 2</p>
            <h2 id={titleId} className="match-dialog__title">
              Ask {name} for advice
            </h2>
            <fieldset className="match-dialog__fieldset">
              <legend className="match-dialog__label">Topic</legend>
              <div className="match-dialog__chips">
                {ADVICE_TOPICS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="match-dialog__chip"
                    aria-pressed={adv.topic === t}
                    onClick={() => setAdv({ ...adv, topic: t })}
                  >
                    {ADVICE_TOPIC_LABELS[t]}
                  </button>
                ))}
              </div>
            </fieldset>
            <label htmlFor={ids.question} className="match-dialog__label">
              Your question
            </label>
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
            <p id={ids.qCount} className="match-dialog__counter" aria-live="polite">
              {lengthCounter(qLen, NOTE_QUESTION_MIN, NOTE_QUESTION_MAX)}
            </p>
            {details ? null : <p className="match-dialog__hint">Still needed: {problems.join(", ")}.</p>}
            <div className="match-dialog__actions">
              <Button type="button" variant="back" onClick={() => (presetPurpose ? onClose() : setStep("purpose"))}>
                {presetPurpose ? "Cancel" : "Back"}
              </Button>
              <Button type="submit" variant="primary" disabled={!details}>
                Preview your note
              </Button>
            </div>
          </form>
        ) : details ? (
          <>
            <p className="match-dialog__step">Step 2 of 2</p>
            <h2 id={titleId} className="match-dialog__title">
              This is what {name} sees
            </h2>
            <NoteCard details={details} senderName={senderName} senderBatch={senderBatch} />
            <p className="match-dialog__body">
              They get this by email or WhatsApp and in Notifications. Your contact details are shared only if they accept.
            </p>
            {error ? (
              <p className="match-dialog__error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="match-dialog__actions">
              <Button variant="back" onClick={() => setStep("fields")} disabled={sending}>
                Edit
              </Button>
              <Button variant="primary" onClick={() => void send()} disabled={sending}>
                {sending ? "Sending…" : "Send note"}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
