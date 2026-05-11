import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type AnimationEvent,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "./Button";
import { CareerIntentFlowChrome } from "./CareerIntentFlowChrome";
import { api, type IntentcastFeedItem } from "../api/client";
import { BULLETIN_POST_MAX_LENGTH } from "../constants/bulletin";
import {
  buildHiringBulletinContent,
  hiringCompensationChipFromParsed,
  hiringExperienceChipFromParsed,
  parseHiringBulletin,
  splitHiringDetailsForCard,
  validateHiringBulletinFields,
  type HiringBulletinComposeFields,
} from "../lib/parseHiringBulletin";
import { queryKeys } from "../lib/queryKeys";

export type PostRoleHiringFlowProps = {
  /** After successful `POST /v1/intentcasts` (same bulletin feed as Home “Active requests”). */
  onPublishSuccess?: (intentcast: IntentcastFeedItem) => void;
};

export type PostRoleHiringFlowHandle = {
  open: () => void;
  close: () => void;
};

type HiringStep = "compose" | "preview";

/** Required compose fields that participate in {@link essentialsValid}. */
type HiringEssentialShakeField = "roleTitle" | "company" | "location" | "employmentType";

const SHAKE_ANIMATION_SUBSTR = "career-hiring-flow-field-shake";

const INITIAL_HIRING_FORM = {
  roleTitle: "",
  company: "",
  location: "",
  employmentType: "Full-time",
  summary: "",
  experienceLevel: "",
  compensation: "",
  applyMethod: "",
  jdLink: "",
  hiringManagerNote: "",
};

const DIGITS_AND_HYPHEN_RE = /[^\d-]/g;

/** Leading digits only; trailing `+` in the field ⇒ `"5+"` so details use real `+` (chip shows `Exp: 5+ years`). */
function sanitizeYears(value: string): string {
  const t = value.trim();
  const m = t.match(/^(\d+)/);
  if (!m) return "";
  const n = m[1]!;
  const rest = t.slice(m[0].length);
  return rest.includes("+") ? `${n}+` : n;
}

function sanitizeCompensation(value: string): string {
  return value.replace(DIGITS_AND_HYPHEN_RE, "");
}

function hiringFormToComposeFields(form: typeof INITIAL_HIRING_FORM): HiringBulletinComposeFields {
  const summary = form.summary.trim();
  const parts: string[] = [];
  parts.push(`${form.employmentType.trim()}.`);
  if (summary) parts.push(summary);
  const exp = sanitizeYears(form.experienceLevel);
  if (exp) {
    parts.push(exp.endsWith("+") ? `${exp.slice(0, -1)}+ years experience.` : `${exp} years experience.`);
  }
  const comp = sanitizeCompensation(form.compensation);
  if (comp) parts.push(`Compensation: ₹ ${comp} LPA.`);
  const apply = form.applyMethod.trim();
  if (apply) parts.push(`Steps to apply: ${apply}.`);
  const jdLink = form.jdLink.trim();
  if (jdLink) parts.push(`Job description: ${jdLink}.`);
  const note = form.hiringManagerNote.trim();
  if (note) parts.push(note);
  return {
    company: form.company.trim(),
    title: form.roleTitle.trim(),
    location: form.location.trim(),
    details: parts.join(" ").replace(/\s+/g, " ").trim(),
  };
}

export const PostRoleHiringFlow = forwardRef<PostRoleHiringFlowHandle, PostRoleHiringFlowProps>(
  function PostRoleHiringFlow({ onPublishSuccess }, ref) {
    const queryClient = useQueryClient();
    const [hiringOpen, setHiringOpen] = useState(false);
    const [hiringStep, setHiringStep] = useState<HiringStep>("compose");
    const [hiringError, setHiringError] = useState<string | null>(null);
    const [hiringForm, setHiringForm] = useState({ ...INITIAL_HIRING_FORM });
    const [submitting, setSubmitting] = useState(false);
    const [shakeEssentialFields, setShakeEssentialFields] = useState<HiringEssentialShakeField[]>([]);

    const composeFirstFieldRef = useRef<HTMLInputElement>(null);
    const previewPanelRef = useRef<HTMLElement>(null);

    const essentialsValid = Boolean(
      hiringForm.roleTitle.trim() &&
        hiringForm.company.trim() &&
        hiringForm.location.trim() &&
        hiringForm.employmentType.trim()
    );

    const bulletinFromForm = useMemo(() => {
      const compose = hiringFormToComposeFields(hiringForm);
      if (validateHiringBulletinFields(compose)) return { content: "", parsed: null as ReturnType<typeof parseHiringBulletin> };
      const content = buildHiringBulletinContent(compose).trim();
      return { content, parsed: parseHiringBulletin(content) };
    }, [hiringForm]);

    const cardSections =
      bulletinFromForm.parsed ? splitHiringDetailsForCard(bulletinFromForm.parsed.description) : null;

    const previewCareerChips = bulletinFromForm.parsed
      ? (
          [
            bulletinFromForm.parsed.employmentLabel,
            hiringExperienceChipFromParsed(bulletinFromForm.parsed.experienceLabel),
            hiringCompensationChipFromParsed(bulletinFromForm.parsed.salaryLabel),
          ].filter(Boolean) as string[]
        ).slice(0, 3)
      : [];

    const previewCompanyLocationLine = bulletinFromForm.parsed
      ? [bulletinFromForm.parsed.company.trim(), bulletinFromForm.parsed.locationLine.trim()].filter(Boolean).join(" | ")
      : "";

    /** Composer summary only — serialized tail repeats employment / exp / comp shown as chips. */
    const previewRoleSummaryCopy = hiringForm.summary.trim();

    useEffect(() => {
      if (!hiringOpen) return;
      const id = window.requestAnimationFrame(() => {
        if (hiringStep === "compose") {
          composeFirstFieldRef.current?.focus();
        } else {
          previewPanelRef.current?.focus();
        }
      });
      return () => window.cancelAnimationFrame(id);
    }, [hiringOpen, hiringStep]);

    const dialogAriaLabel =
      hiringStep === "compose"
        ? "Post a role to alumni, step 1 of 2: Compose"
        : "Post a role to alumni, step 2 of 2: Preview";

    const openHiringFlow = useCallback(() => {
      setHiringOpen(true);
      setHiringStep("compose");
      setHiringError(null);
      setShakeEssentialFields([]);
    }, []);

    const closeHiringFlow = useCallback(() => {
      setHiringOpen(false);
      setHiringStep("compose");
      setHiringError(null);
      setShakeEssentialFields([]);
    }, []);

    const clearEssentialShake = useCallback((field: HiringEssentialShakeField) => {
      setShakeEssentialFields((prev) => prev.filter((f) => f !== field));
    }, []);

    const essentialShakeClass = useCallback(
      (field: HiringEssentialShakeField) =>
        shakeEssentialFields.includes(field) ? " career-hiring-flow__field--shake" : "",
      [shakeEssentialFields]
    );

    const onEssentialShakeEnd = useCallback(
      (field: HiringEssentialShakeField) => (e: AnimationEvent<HTMLLabelElement>) => {
        if (e.target !== e.currentTarget) return;
        if (!String(e.animationName).includes(SHAKE_ANIMATION_SUBSTR)) return;
        clearEssentialShake(field);
      },
      [clearEssentialShake]
    );

    const goToPreview = useCallback(() => {
      if (!essentialsValid) {
        setHiringError(null);
        const empty: HiringEssentialShakeField[] = [];
        if (!hiringForm.roleTitle.trim()) empty.push("roleTitle");
        if (!hiringForm.company.trim()) empty.push("company");
        if (!hiringForm.location.trim()) empty.push("location");
        if (!hiringForm.employmentType.trim()) empty.push("employmentType");
        setShakeEssentialFields([]);
        window.requestAnimationFrame(() => setShakeEssentialFields(empty));
        return;
      }
      const summary = hiringForm.summary.trim();
      if (summary.length < 10) {
        setHiringError("Add a role summary (at least 10 characters) before preview.");
        return;
      }
      setHiringError(null);
      setShakeEssentialFields([]);
      setHiringStep("preview");
    }, [essentialsValid, hiringForm.company, hiringForm.location, hiringForm.roleTitle, hiringForm.employmentType, hiringForm.summary]);

    const goBackToCompose = useCallback(() => {
      setHiringError(null);
      setShakeEssentialFields([]);
      setHiringStep("compose");
    }, []);

    const publishHiringPost = useCallback(async () => {
      const compose = hiringFormToComposeFields(hiringForm);
      const fieldErr = validateHiringBulletinFields(compose);
      if (fieldErr) {
        setHiringError(fieldErr);
        return;
      }
      const content = buildHiringBulletinContent(compose).trim();
      if (content.length < 10) {
        setHiringError("Post is too short — add a bit more detail.");
        return;
      }
      if (content.length > BULLETIN_POST_MAX_LENGTH) {
        setHiringError(`Post is too long — shorten details (max ${BULLETIN_POST_MAX_LENGTH} characters).`);
        return;
      }
      setHiringError(null);
      setSubmitting(true);
      const { data, error: apiErr } = await api.post<{ intentcast: IntentcastFeedItem }>("/v1/intentcasts", {
        category: "hiring",
        content,
      });
      setSubmitting(false);
      if (apiErr || !data?.intentcast) {
        setHiringError(apiErr?.message ?? apiErr?.code ?? "Could not publish hiring post.");
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.feedQueries() });
      void queryClient.invalidateQueries({ queryKey: ["home", "opportunity-rail"], refetchType: "active" });
      onPublishSuccess?.(data.intentcast);
      setHiringOpen(false);
      setHiringStep("compose");
      setHiringForm({ ...INITIAL_HIRING_FORM });
    }, [hiringForm, onPublishSuccess, queryClient]);

    useImperativeHandle(
      ref,
      () => ({
        open: openHiringFlow,
        close: closeHiringFlow,
      }),
      [closeHiringFlow, openHiringFlow]
    );

    if (!hiringOpen) return null;

    return (
      <CareerIntentFlowChrome
        ariaLabel={dialogAriaLabel}
        onRequestClose={closeHiringFlow}
        step={hiringStep}
        stepsAriaLabel="Hiring flow steps"
        closeAriaLabel="Close hiring flow"
      >
          <div className="career-hiring-flow__layout career-hiring-flow__layout--review">
            <div className="career-hiring-flow__main ds-surface-card">
              {hiringStep === "compose" ? (
                <>
                  <div className="career-hiring-flow__grid">
                    <label
                      className={`career-hiring-flow__field${essentialShakeClass("roleTitle")}`}
                      onAnimationEnd={onEssentialShakeEnd("roleTitle")}
                    >
                      <span>Role *</span>
                      <input
                        ref={composeFirstFieldRef}
                        className="input"
                        value={hiringForm.roleTitle}
                        onChange={(e) => setHiringForm((prev) => ({ ...prev, roleTitle: e.target.value }))}
                        placeholder="Backend Engineer"
                      />
                    </label>
                    <label
                      className={`career-hiring-flow__field${essentialShakeClass("company")}`}
                      onAnimationEnd={onEssentialShakeEnd("company")}
                    >
                      <span>Company *</span>
                      <input
                        className="input"
                        value={hiringForm.company}
                        onChange={(e) => setHiringForm((prev) => ({ ...prev, company: e.target.value }))}
                        placeholder="Razorpay"
                      />
                    </label>
                    <label
                      className={`career-hiring-flow__field${essentialShakeClass("location")}`}
                      onAnimationEnd={onEssentialShakeEnd("location")}
                    >
                      <span>Location *</span>
                      <input
                        className="input"
                        value={hiringForm.location}
                        onChange={(e) => setHiringForm((prev) => ({ ...prev, location: e.target.value }))}
                        placeholder="Bengaluru"
                      />
                    </label>
                    <label
                      className={`career-hiring-flow__field${essentialShakeClass("employmentType")}`}
                      onAnimationEnd={onEssentialShakeEnd("employmentType")}
                    >
                      <span>Employment type *</span>
                      <select
                        className="input"
                        value={hiringForm.employmentType}
                        onChange={(e) => setHiringForm((prev) => ({ ...prev, employmentType: e.target.value }))}
                      >
                        <option>Full-time</option>
                        <option>Internship</option>
                        <option>Contract</option>
                      </select>
                    </label>
                    <label className="career-hiring-flow__field" htmlFor="hiring-flow-experience-years">
                      <span>Experience</span>
                      <div className="career-hiring-flow__input-slot">
                        <input
                          id="hiring-flow-experience-years"
                          className="career-hiring-flow__input-slot-control"
                          inputMode="text"
                          autoComplete="off"
                          title="Years of experience; add + after the number if you mean ‘or more’ (e.g. 5+)."
                          value={hiringForm.experienceLevel}
                          onChange={(e) =>
                            setHiringForm((prev) => ({
                              ...prev,
                              experienceLevel: sanitizeYears(e.target.value),
                            }))
                          }
                          placeholder="5"
                        />
                        <span className="career-hiring-flow__input-slot-suffix" aria-hidden="true">
                          years
                        </span>
                      </div>
                    </label>
                    <label className="career-hiring-flow__field" htmlFor="hiring-flow-compensation-lpa">
                      <span>Compensation</span>
                      <div className="career-hiring-flow__input-slot">
                        <input
                          id="hiring-flow-compensation-lpa"
                          className="career-hiring-flow__input-slot-control"
                          inputMode="numeric"
                          autoComplete="off"
                          value={hiringForm.compensation}
                          onChange={(e) =>
                            setHiringForm((prev) => ({
                              ...prev,
                              compensation: sanitizeCompensation(e.target.value),
                            }))
                          }
                          placeholder="12-18"
                        />
                        <span className="career-hiring-flow__input-slot-suffix" aria-hidden="true">
                          LPA
                        </span>
                      </div>
                    </label>
                    <label className="career-hiring-flow__field">
                      <span>How to apply?</span>
                      <input
                        className="input"
                        value={hiringForm.applyMethod}
                        onChange={(e) => setHiringForm((prev) => ({ ...prev, applyMethod: e.target.value }))}
                        placeholder="Email / Application link / Message"
                      />
                    </label>
                    <label className="career-hiring-flow__field career-hiring-flow__field--wide">
                      <span>Link to Job Description</span>
                      <input
                        className="input"
                        type="text"
                        inputMode="url"
                        autoComplete="url"
                        value={hiringForm.jdLink}
                        onChange={(e) => setHiringForm((prev) => ({ ...prev, jdLink: e.target.value }))}
                        placeholder="https://…"
                      />
                    </label>
                    <label className="career-hiring-flow__field career-hiring-flow__field--wide">
                      <span>Role summary *</span>
                      <textarea
                        className="input input--textarea"
                        rows={4}
                        value={hiringForm.summary}
                        onChange={(e) => setHiringForm((prev) => ({ ...prev, summary: e.target.value }))}
                        placeholder="Work on scalable backend systems that power millions of transactions every day."
                      />
                    </label>
                  </div>
                  <footer className="career-hiring-flow__actions">
                    <Button type="button" variant="secondary" onClick={goToPreview}>
                      Preview
                    </Button>
                  </footer>
                </>
              ) : null}

              {hiringStep === "preview" ? (
                <>
                  <div className="career-hiring-flow__preview-stack">
                    <article
                      ref={previewPanelRef}
                      tabIndex={-1}
                      className="career-hiring-flow__preview ds-surface-card"
                      aria-label="Structured bulletin preview"
                    >
                      {bulletinFromForm.parsed ? (
                        <>
                          <p className="career-hiring-flow__preview-title">{bulletinFromForm.parsed.title}</p>
                          {previewCompanyLocationLine ? (
                            <p className="career-hiring-flow__preview-meta">{previewCompanyLocationLine}</p>
                          ) : null}
                          {previewRoleSummaryCopy ? (
                            <p className="career-hiring-flow__preview-copy">{previewRoleSummaryCopy}</p>
                          ) : null}
                          {cardSections?.jdUrl ? (
                            <>
                              <p className="career-hiring-flow__preview-section-title">Role link</p>
                              <p className="career-hiring-flow__preview-note">
                                <a href={cardSections.jdUrl}>{cardSections.jdUrl}</a>
                              </p>
                            </>
                          ) : null}
                          {previewCareerChips.length > 0 ? (
                            <div className="career-hiring-flow__preview-chips">
                              {previewCareerChips.map((label, idx) => (
                                <span key={`${label}-${idx}`}>{label}</span>
                              ))}
                            </div>
                          ) : null}
                          {cardSections?.applySteps ? (
                            <>
                              <p className="career-hiring-flow__preview-section-title">How to apply</p>
                              <p className="career-hiring-flow__preview-copy">{cardSections.applySteps}</p>
                            </>
                          ) : null}
                        </>
                      ) : (
                        <p className="career-hiring-flow__preview-copy">
                          {bulletinFromForm.content ||
                            "Unable to build preview — go back and check required fields."}
                        </p>
                      )}
                    </article>
                  </div>
                </>
              ) : null}

              {hiringError ? (
                <p className="career-hiring-flow__error" role="alert">
                  {hiringError}
                </p>
              ) : null}

              {hiringStep === "preview" ? (
                <>
                  <footer className="career-hiring-flow__actions career-hiring-flow__actions--publish">
                    <Button type="button" variant="primary" onClick={goBackToCompose}>
                      Back
                    </Button>
                    <Button type="button" variant="secondary" disabled={submitting} onClick={() => void publishHiringPost()}>
                      {submitting ? "Publishing…" : "Publish role"}
                    </Button>
                  </footer>
                  <p className="career-hiring-flow__publish-note">Your role will go live instantly.</p>
                </>
              ) : null}
            </div>
          </div>
      </CareerIntentFlowChrome>
    );
  }
);
