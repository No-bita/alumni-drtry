import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type IntentcastFeedItem } from "../api/client";
import {
  BULLETIN_DESCRIPTION_MAX_CHARS,
  BULLETIN_TITLE_MAX_CHARS,
} from "../constants/bulletin";
import type {
  BulletinGeneralCategory,
  CareersBulletinPreset,
  PostBulletinFlowHandleShape,
  PostBulletinOpenOptions,
} from "../lib/bulletinFlowBindings";
import {
  buildReferralIntentBulletinHeadline,
  encodeBulletinContentWithUiCategory,
  validateGeneralBulletinHeadlineDetails,
} from "../lib/bulletinPostCardUtils";
import { trackBetaUsageEvent } from "../lib/betaAnalytics";
import { mapIntentcastToRow } from "../lib/careerFeedRow";
import { queryKeys } from "../lib/queryKeys";
import {
  WALL_TOPIC_FAMILIES,
  WALL_TOPIC_FAMILY_LABEL,
  wallLaneToTopicFamily,
  wallTopicFamilyToUiCategory,
  type WallTopicFamily,
} from "../lib/wallTopics";
import { useAuth } from "../contexts/AuthContext";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { Button } from "./Button";
import { CareerIntentFlowChrome } from "./CareerIntentFlowChrome";
import { IntentcastActivityRowsList } from "./CareerIntentFeedRows";
import "../styles/wall-composer.css";

/** Accepts absolute http(s) URLs or host/path — normalized for stored `Resume link:` lines. */
function tryNormalizeExternalHttpUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(t);
  if (scheme && !/^https?$/i.test(scheme[1])) {
    // host:port[/path] input (e.g. example.com:8080/jobs) is not a scheme — allow prefixing,
    // but only when the part before ':' looks like a host; ftp:21/x style input is rejected.
    const rest = t.slice(scheme[0].length);
    if (!/^\d+(\/|$)/.test(rest) || !scheme[1].includes(".")) return null;
  }
  const candidate = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Structured tail lines below the fit text, parsed back out by extractStructuredCareerRoleLink for feed/preview display. */
function referralSeekingLinkLines(jobRaw: string, resumeRaw: string): string[] {
  const lines: string[] = [];
  const jobNorm = jobRaw.trim().length > 0 ? tryNormalizeExternalHttpUrl(jobRaw) : null;
  if (jobNorm) lines.push(`Role link: ${jobNorm}`);
  const resumeNorm = resumeRaw.trim().length > 0 ? tryNormalizeExternalHttpUrl(resumeRaw) : null;
  if (resumeNorm) lines.push(`Resume link: ${resumeNorm}`);
  return lines;
}

function referralSeekingDetailsBlock(fit: string, jobRaw: string, resumeRaw: string): string {
  return [fit.trim(), ...referralSeekingLinkLines(jobRaw, resumeRaw)].filter(Boolean).join("\n\n");
}

function bulletinUiCategoryToApiCategory(category: BulletinGeneralCategory): IntentcastFeedItem["category"] {
  switch (category) {
    case "careers":
      return "mentorship";
    case "hiring":
      return "hiring";
    case "relocation":
      return "collaboration";
    case "startups":
      return "collaboration";
    case "guidance":
      return "guidance";
  }
}

/** Shown near the top of the composer and on the preview. Informational only: the Wall has one shared audience. */
const WALL_COMPOSER_VISIBILITY_LINE = "Alma Mater community - Visible to everyone signed in to Alma Mater";

const WALL_COMPOSER_TOPIC_REQUIRED_HINT = "Choose one topic before previewing.";

const WALL_COMPOSER_PRIVACY_REMINDER =
  "Avoid sharing personal contact details or sensitive information in a public post.";

/** Static details prompts (spec section 5): chosen by the selected topic, which entry points preselect. */
const WALL_COMPOSER_DETAILS_PLACEHOLDERS = {
  guidance: "What are you trying to figure out? Share relevant context and what kind of advice would help.",
  opportunity: "What is the opportunity, who is it for, and how can interested alumni follow up?",
  cityHelp: "Which city or neighbourhood, what are you looking for, and what constraints should people know?",
  discussion: "Share your perspective, question or experience to start the conversation.",
} as const;

function wallComposerDetailsPlaceholder(topic: WallTopicFamily | null): string {
  switch (topic) {
    case "careers":
      return WALL_COMPOSER_DETAILS_PLACEHOLDERS.guidance;
    case "startups":
      return WALL_COMPOSER_DETAILS_PLACEHOLDERS.opportunity;
    case "relocation":
      return WALL_COMPOSER_DETAILS_PLACEHOLDERS.cityHelp;
    case "guidance":
    case null:
      return WALL_COMPOSER_DETAILS_PLACEHOLDERS.discussion;
  }
}

/** Email-like or phone-like text (10+ digits with optional spaces, dashes, dots, brackets or a leading +). */
const EMAIL_LIKE = /[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/i;
const PHONE_LIKE = /(?<![\w/=.-])\+?\(?\d(?:[\s().-]*\d){9,14}(?![\w/])/;

function textLooksLikeContactDetails(text: string): boolean {
  return EMAIL_LIKE.test(text) || PHONE_LIKE.test(text);
}

/** The topic a caller's preset opens with. Mapped through the contract module only; structured hiring retains its separate flow. */
function presetTopicFamily(
  preset: CareersBulletinPreset | null,
  category: BulletinGeneralCategory | undefined
): WallTopicFamily | null {
  if (preset === "referralSeeking") return "careers";
  if (preset === "canHelp") return "guidance";
  return category ? wallLaneToTopicFamily(category) : null;
}

function entryPointFor(preset: CareersBulletinPreset | null, options?: PostBulletinOpenOptions): string {
  if (preset === "referralSeeking") return "careers_referral";
  if (preset === "canHelp") return "careers";
  if (options?.placeId || options?.category === "relocation") return "cities";
  if (options?.category) return "match";
  return "wall";
}

export type PostBulletinFlowProps = {
  onPublishSuccess?: (intentcast: IntentcastFeedItem) => void;
};

export type PostBulletinFlowHandle = PostBulletinFlowHandleShape;

type BulletinStep = "compose" | "preview";

type ComposerField = "topic" | "title" | "details" | "jobLink" | "company" | "resume";

type FieldErrors = Partial<Record<ComposerField, string>>;

const FIELD_ORDER_GENERAL: ComposerField[] = ["title", "details", "topic"];
const FIELD_ORDER_REFERRAL: ComposerField[] = ["jobLink", "title", "company", "details", "resume"];

function CharCount({ value, max, id }: { value: string; max: number; id: string }) {
  const n = value.length;
  return (
    <span id={id} className={`wall-composer__count${n >= max ? " wall-composer__count--max" : ""}`} aria-live="off">
      {n}/{max}
    </span>
  );
}

function FieldError({ id, message }: { id: string; message: string | undefined }): ReactNode {
  if (!message) return null;
  return (
    <p id={id} className="wall-composer__field-error" role="alert">
      {message}
    </p>
  );
}

export const PostBulletinFlow = forwardRef<PostBulletinFlowHandle, PostBulletinFlowProps>(
  function PostBulletinFlow({ onPublishSuccess }, ref) {
    const auth = useAuth();
    const queryClient = useQueryClient();
    const uid = useId();
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<BulletinStep>("compose");
    /** Required: one of the four Wall topic families. Never defaulted silently. */
    const [topic, setTopic] = useState<WallTopicFamily | null>(null);
    const [headline, setHeadline] = useState("");
    const [body, setBody] = useState("");
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [publishError, setPublishError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    /** Careers hub presets: the referral ask keeps its structured fields. */
    const [careersPreset, setCareersPreset] = useState<CareersBulletinPreset | null>(null);
    const [referralJobLink, setReferralJobLink] = useState("");
    const [referralCompanyName, setReferralCompanyName] = useState("");
    /** Cities: the post is tagged with this city (POST /v1/intentcasts `placeId`). */
    const [placeId, setPlaceId] = useState<string | null>(null);
    const [referralResumeLink, setReferralResumeLink] = useState("");

    const rootRef = useRef<HTMLDivElement>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const previewHeadingRef = useRef<HTMLHeadingElement>(null);
    const keepEditingRef = useRef<HTMLButtonElement>(null);
    const fieldRefs = useRef<Partial<Record<ComposerField, HTMLElement | null>>>({});

    const isReferral = careersPreset === "referralSeeking";

    useBodyScrollLock(open);

    const composedContent = useMemo(() => {
      if (isReferral) {
        const role = headline.trim();
        const company = referralCompanyName.trim();
        const detailsBlock = referralSeekingDetailsBlock(body, referralJobLink, referralResumeLink);
        if (!role && !company && !detailsBlock) return "";
        if (role) {
          const headLine = buildReferralIntentBulletinHeadline(role, company);
          return detailsBlock ? `${headLine}\n${detailsBlock}` : headLine;
        }
        const draftLines: string[] = [];
        if (company) draftLines.push(`Company: ${company}`);
        if (detailsBlock) draftLines.push(detailsBlock);
        return draftLines.join("\n");
      }
      const h = headline.trim();
      const b = body.trim();
      if (!h && !b) return "";
      if (!b) return h;
      if (!h) return b;
      return `${h}\n${b}`;
    }, [body, headline, isReferral, referralCompanyName, referralJobLink, referralResumeLink]);

    const hasContent =
      headline.trim().length > 0 ||
      body.trim().length > 0 ||
      referralJobLink.trim().length > 0 ||
      referralCompanyName.trim().length > 0 ||
      referralResumeLink.trim().length > 0;

    const reset = useCallback(() => {
      setStep("compose");
      setTopic(null);
      setHeadline("");
      setBody("");
      setReferralJobLink("");
      setReferralCompanyName("");
      setReferralResumeLink("");
      setFieldErrors({});
      setPublishError(null);
      setSubmitting(false);
      setConfirmDiscard(false);
      setCareersPreset(null);
      setPlaceId(null);
    }, []);

    const closeFlow = useCallback(() => {
      setOpen(false);
      reset();
    }, [reset]);

    /** Close control, overlay click and Esc: ask before throwing away typed content. */
    const requestClose = useCallback(() => {
      if (submitting) return;
      if (hasContent) {
        setConfirmDiscard(true);
        return;
      }
      closeFlow();
    }, [closeFlow, hasContent, submitting]);

    const openFlow = useCallback((options?: PostBulletinOpenOptions) => {
      let preset: CareersBulletinPreset | null = options?.careersPreset ?? null;
      if (!preset && options?.referralSeeking === true) preset = "referralSeeking";
      setCareersPreset(preset);
      setStep("compose");
      setTopic(presetTopicFamily(preset, options?.category));
      setHeadline((options?.headline ?? "").trim().slice(0, BULLETIN_TITLE_MAX_CHARS));
      setBody((options?.body ?? "").trim().slice(0, BULLETIN_DESCRIPTION_MAX_CHARS));
      setReferralJobLink("");
      setReferralCompanyName((options?.referralCompanyName ?? "").trim().slice(0, 120));
      setReferralResumeLink("");
      setPlaceId(options?.placeId ?? null);
      setFieldErrors({});
      setPublishError(null);
      setConfirmDiscard(false);
      setOpen(true);
      trackBetaUsageEvent("intentcast_compose_opened", { entryPoint: entryPointFor(preset, options) });
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        open: openFlow,
        close: closeFlow,
      }),
      [closeFlow, openFlow]
    );

    const viewer =
      auth.status === "authenticated"
        ? {
            personId: auth.person.personId,
            fullName: (auth.myProfile?.fullName ?? "").trim() || "You",
            dept: auth.myProfile?.departmentCode ?? null,
            batchYear: auth.myProfile?.batchYear ?? null,
          }
        : null;

    /** Referral validation is unchanged from the previous form (same checks, same order, same copy). */
    const validateReferral = useCallback((): FieldErrors => {
      const jl = referralJobLink.trim();
      if (!jl) return { jobLink: "Add the job link for this opening." };
      if (!tryNormalizeExternalHttpUrl(jl)) return { jobLink: "Job link must be a valid http(s) URL." };
      const ht = headline.trim();
      if (ht.length < 3) return { title: "Add a role title (at least 3 characters)." };
      const co = referralCompanyName.trim();
      const bt = body.trim();
      if (ht.length > BULLETIN_TITLE_MAX_CHARS) {
        return { title: `Role must be at most ${BULLETIN_TITLE_MAX_CHARS} characters.` };
      }
      if (!co) return { company: "Add the company for this opening." };
      if (co.length > BULLETIN_TITLE_MAX_CHARS) {
        return { company: `Company must be at most ${BULLETIN_TITLE_MAX_CHARS} characters.` };
      }
      const headLine = buildReferralIntentBulletinHeadline(ht, co);
      if (headLine.length > BULLETIN_TITLE_MAX_CHARS) {
        return {
          company: `Referral headline is too long (max ${BULLETIN_TITLE_MAX_CHARS} characters). Shorten the role or company.`,
        };
      }
      if (!bt) return { details: "Add why you're a fit for this role." };
      if (bt.length > BULLETIN_DESCRIPTION_MAX_CHARS) {
        return { details: `Your fit answer must be at most ${BULLETIN_DESCRIPTION_MAX_CHARS} characters.` };
      }
      const rr = referralResumeLink.trim();
      if (rr && !tryNormalizeExternalHttpUrl(rr)) return { resume: "Resume Link must be a valid http(s) URL." };
      const content = composedContent.trim();
      if (content.length < 10) return { details: "Add a bit more detail (10 characters minimum)" };
      if (validateGeneralBulletinHeadlineDetails(content)) {
        return {
          details: "Your fit answer, job link and resume link together are too long — shorten the fit answer.",
        };
      }
      return {};
    }, [body, composedContent, headline, referralCompanyName, referralJobLink, referralResumeLink]);

    /** General posts: title required (3–120), details optional (≤ 500), one topic required. */
    const validateGeneral = useCallback((): FieldErrors => {
      const errors: FieldErrors = {};
      const ht = headline.trim();
      if (ht.length < 3) errors.title = "Add a title (at least 3 characters).";
      else if (ht.length > BULLETIN_TITLE_MAX_CHARS) {
        errors.title = `Title must be at most ${BULLETIN_TITLE_MAX_CHARS} characters.`;
      }
      if (body.trim().length > BULLETIN_DESCRIPTION_MAX_CHARS) {
        errors.details = `Details must be at most ${BULLETIN_DESCRIPTION_MAX_CHARS} characters.`;
      }
      if (!topic) errors.topic = WALL_COMPOSER_TOPIC_REQUIRED_HINT;
      if (!errors.title && !errors.details) {
        const generalErr = validateGeneralBulletinHeadlineDetails(composedContent.trim());
        if (generalErr) errors.details = generalErr;
      }
      return errors;
    }, [body, composedContent, headline, topic]);

    const validateCompose = useCallback(
      (): FieldErrors => (isReferral ? validateReferral() : validateGeneral()),
      [isReferral, validateGeneral, validateReferral]
    );

    const focusFirstError = useCallback(
      (errors: FieldErrors) => {
        const order = isReferral ? FIELD_ORDER_REFERRAL : FIELD_ORDER_GENERAL;
        const first = order.find((f) => errors[f]);
        if (first) fieldRefs.current[first]?.focus();
      },
      [isReferral]
    );

    const goToPreview = useCallback(() => {
      const errors = validateCompose();
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        focusFirstError(errors);
        return;
      }
      setFieldErrors({});
      setPublishError(null);
      setStep("preview");
      trackBetaUsageEvent("intentcast_step_advanced", { step: "preview" });
    }, [focusFirstError, validateCompose]);

    const goBackToCompose = useCallback(() => {
      setPublishError(null);
      setStep("compose");
    }, []);

    const uiCategory: BulletinGeneralCategory | null = topic ? wallTopicFamilyToUiCategory(topic) : null;

    const publish = useCallback(async () => {
      const errors = validateCompose();
      if (Object.keys(errors).length > 0 || !uiCategory) {
        setFieldErrors(errors);
        setStep("compose");
        return;
      }
      const content = encodeBulletinContentWithUiCategory(composedContent.trim(), uiCategory);
      setPublishError(null);
      setSubmitting(true);
      // `kind` is deliberately omitted: the API stores null (Ask / Offer / Invitation is no longer asked).
      const { data, error: apiErr } = await api.post<{ intentcast: IntentcastFeedItem }>("/v1/intentcasts", {
        category: bulletinUiCategoryToApiCategory(uiCategory),
        content,
        ...(placeId ? { placeId } : {}),
      });
      setSubmitting(false);
      if (apiErr || !data?.intentcast) {
        setPublishError(apiErr?.message ?? apiErr?.code ?? "Couldn't publish. Try again.");
        trackBetaUsageEvent("intentcast_publish_failed", { code: apiErr?.code ?? "unknown" });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.feedQueries() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.detail(data.intentcast.id) });
      onPublishSuccess?.(data.intentcast);
      closeFlow();
    }, [closeFlow, composedContent, onPublishSuccess, placeId, queryClient, uiCategory, validateCompose]);

    /** The post exactly as the Wall renders it: same mapper, same row component. */
    let previewRow: ReturnType<typeof mapIntentcastToRow> = null;
    if (viewer && uiCategory && step === "preview") {
      const now = new Date().toISOString();
      previewRow = mapIntentcastToRow(
        {
          id: "wall-composer-preview",
          authorPersonId: viewer.personId,
          authorFullName: viewer.fullName,
          authorDepartmentCode: viewer.dept,
          authorDepartmentName: null,
          authorBatchYear: viewer.batchYear,
          authorCurrentRoleTitle: null,
          authorCurrentOrganizationName: null,
          category: bulletinUiCategoryToApiCategory(uiCategory),
          kind: null,
          content: encodeBulletinContentWithUiCategory(composedContent.trim(), uiCategory),
          status: "open",
          expiresAt: now,
          closedAt: null,
          createdAt: now,
          editableUntil: now,
          responseCount: 0,
          viewerHasResponded: false,
        },
        { includeGuidancePosts: true }
      );
    }

    const privacyText = [headline, body, referralCompanyName].join("\n");
    const showPrivacyReminder = textLooksLikeContactDetails(privacyText);

    // Focus: title on the write step, the preview heading on the preview step.
    useEffect(() => {
      if (!open) return;
      const id = window.requestAnimationFrame(() => {
        if (step === "compose") titleInputRef.current?.focus();
        else previewHeadingRef.current?.focus();
      });
      return () => window.cancelAnimationFrame(id);
    }, [open, step]);

    useEffect(() => {
      if (!confirmDiscard) return;
      keepEditingRef.current?.focus();
    }, [confirmDiscard]);

    // Focus trap + Esc, scoped to this dialog.
    useEffect(() => {
      if (!open) return;
      const onKeyDown = (event: KeyboardEvent) => {
        const dialog = rootRef.current?.closest<HTMLElement>('[role="dialog"]');
        if (!dialog) return;
        if (event.key === "Escape") {
          event.preventDefault();
          if (confirmDiscard) setConfirmDiscard(false);
          else requestClose();
          return;
        }
        if (event.key !== "Tab") return;
        const focusables = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.closest("[inert]") && el.getAttribute("aria-hidden") !== "true");
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        const inside = active instanceof Node && dialog.contains(active);
        if (event.shiftKey) {
          if (!inside || active === first) {
            event.preventDefault();
            last.focus();
          }
        } else if (!inside || active === last) {
          event.preventDefault();
          first.focus();
        }
      };
      document.addEventListener("keydown", onKeyDown);
      return () => document.removeEventListener("keydown", onKeyDown);
    }, [confirmDiscard, open, requestClose]);

    if (!open || !viewer) return null;

    const ids = {
      title: `${uid}-title`,
      titleCount: `${uid}-title-count`,
      titleError: `${uid}-title-error`,
      details: `${uid}-details`,
      detailsCount: `${uid}-details-count`,
      detailsError: `${uid}-details-error`,
      topicLegend: `${uid}-topic-legend`,
      topicError: `${uid}-topic-error`,
      jobLink: `${uid}-job-link`,
      jobLinkError: `${uid}-job-link-error`,
      company: `${uid}-company`,
      companyError: `${uid}-company-error`,
      resume: `${uid}-resume`,
      resumeError: `${uid}-resume-error`,
      privacy: `${uid}-privacy`,
      visibility: `${uid}-visibility`,
    };

    const describedBy = (...parts: Array<string | false | null | undefined>) =>
      parts.filter(Boolean).join(" ") || undefined;

    const setFieldRef = (field: ComposerField) => (el: HTMLElement | null) => {
      fieldRefs.current[field] = el;
    };

    const clearFieldError = (field: ComposerField) => {
      if (!fieldErrors[field]) return;
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    };

    const headerTitle = isReferral ? "Ask for a referral" : "Create a post";
    const dialogAriaLabel = `${headerTitle}, step ${step === "compose" ? "1 of 2: Write" : "2 of 2: Preview"}`;
    const publishLabel = isReferral ? "Publish" : careersPreset === "canHelp" ? "Publish offer" : "Publish post";

    const fitMaxLength = Math.max(
      0,
      BULLETIN_DESCRIPTION_MAX_CHARS -
        referralSeekingLinkLines(referralJobLink, referralResumeLink).join("\n\n").length -
        2
    );

    const topicChips = (
      <fieldset
        className={`wall-composer__topics${fieldErrors.topic ? " wall-composer__topics--invalid" : ""}`}
        aria-describedby={describedBy(fieldErrors.topic && ids.topicError)}
      >
        <legend id={ids.topicLegend} className="wall-composer__section-label">
          Topic <span className="wall-composer__required">Required</span>
        </legend>
        <div className="wall-composer__chips" role="radiogroup" aria-labelledby={ids.topicLegend} aria-required="true">
          {WALL_TOPIC_FAMILIES.map((family, index) => (
            <label key={family.id} className="wall-composer__chip">
              <input
                ref={index === 0 ? setFieldRef("topic") : undefined}
                type="radio"
                name={`${uid}-topic`}
                value={family.id}
                checked={topic === family.id}
                onChange={() => {
                  setTopic(family.id);
                  clearFieldError("topic");
                }}
              />
              <span>{family.label}</span>
            </label>
          ))}
        </div>
        <FieldError id={ids.topicError} message={fieldErrors.topic} />
      </fieldset>
    );

    const generalFields = (
      <>
        <div className="wall-composer__card">
          <p className="wall-composer__section-label" aria-hidden="true">
            Your post
          </p>
          <label className="visually-hidden" htmlFor={ids.title}>
            Title (required)
          </label>
          <input
            id={ids.title}
            ref={(el) => {
              titleInputRef.current = el;
              fieldRefs.current.title = el;
            }}
            className="wall-composer__title-input"
            value={headline}
            onChange={(e) => {
              setHeadline(e.target.value);
              clearFieldError("title");
            }}
            placeholder="Give your post a clear title"
            maxLength={BULLETIN_TITLE_MAX_CHARS}
            autoComplete="off"
            aria-required="true"
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={describedBy(ids.titleCount, fieldErrors.title && ids.titleError)}
          />
          <div className="wall-composer__meta-row">
            <FieldError id={ids.titleError} message={fieldErrors.title} />
            <CharCount id={ids.titleCount} value={headline} max={BULLETIN_TITLE_MAX_CHARS} />
          </div>
          <div className="wall-composer__divider" aria-hidden="true" />
          <label className="visually-hidden" htmlFor={ids.details}>
            Details (optional)
          </label>
          <textarea
            id={ids.details}
            ref={setFieldRef("details")}
            className="wall-composer__details-input"
            rows={5}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              clearFieldError("details");
            }}
            placeholder={wallComposerDetailsPlaceholder(topic)}
            maxLength={BULLETIN_DESCRIPTION_MAX_CHARS}
            aria-invalid={fieldErrors.details ? true : undefined}
            aria-describedby={describedBy(
              ids.detailsCount,
              fieldErrors.details && ids.detailsError,
              showPrivacyReminder && ids.privacy
            )}
          />
          <div className="wall-composer__meta-row">
            <FieldError id={ids.detailsError} message={fieldErrors.details} />
            <span className="wall-composer__optional">Details are optional</span>
            <CharCount id={ids.detailsCount} value={body} max={BULLETIN_DESCRIPTION_MAX_CHARS} />
          </div>
        </div>
        {topicChips}
      </>
    );

    const referralFields = (
      <div className="wall-composer__card wall-composer__card--fields">
        <div className="wall-composer__field">
          <label htmlFor={ids.jobLink}>Job link *</label>
          <input
            id={ids.jobLink}
            ref={setFieldRef("jobLink")}
            className="input"
            type="url"
            inputMode="url"
            autoComplete="off"
            value={referralJobLink}
            onChange={(e) => {
              setReferralJobLink(e.target.value);
              clearFieldError("jobLink");
            }}
            placeholder="https://company.com/jobs/…"
            maxLength={2048}
            aria-required="true"
            aria-invalid={fieldErrors.jobLink ? true : undefined}
            aria-describedby={describedBy(fieldErrors.jobLink && ids.jobLinkError)}
          />
          <FieldError id={ids.jobLinkError} message={fieldErrors.jobLink} />
        </div>
        <div className="wall-composer__field">
          <label htmlFor={ids.title}>Role *</label>
          <input
            id={ids.title}
            ref={(el) => {
              titleInputRef.current = el;
              fieldRefs.current.title = el;
            }}
            className="input"
            value={headline}
            onChange={(e) => {
              setHeadline(e.target.value);
              clearFieldError("title");
            }}
            placeholder="Senior Backend Engineer"
            maxLength={BULLETIN_TITLE_MAX_CHARS}
            autoComplete="off"
            aria-required="true"
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={describedBy(fieldErrors.title && ids.titleError)}
          />
          <FieldError id={ids.titleError} message={fieldErrors.title} />
        </div>
        <div className="wall-composer__field">
          <label htmlFor={ids.company}>Company *</label>
          <input
            id={ids.company}
            ref={setFieldRef("company")}
            className="input"
            value={referralCompanyName}
            onChange={(e) => {
              setReferralCompanyName(e.target.value);
              clearFieldError("company");
            }}
            placeholder="Razorpay"
            maxLength={BULLETIN_TITLE_MAX_CHARS}
            autoComplete="organization"
            aria-required="true"
            aria-invalid={fieldErrors.company ? true : undefined}
            aria-describedby={describedBy(fieldErrors.company && ids.companyError)}
          />
          <FieldError id={ids.companyError} message={fieldErrors.company} />
        </div>
        <div className="wall-composer__field">
          <label htmlFor={ids.details}>Why are you a fit for this role? *</label>
          <textarea
            id={ids.details}
            ref={setFieldRef("details")}
            className="input input--textarea"
            rows={4}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              clearFieldError("details");
            }}
            placeholder="The experience that makes you a fit for this role."
            maxLength={fitMaxLength}
            aria-required="true"
            aria-invalid={fieldErrors.details ? true : undefined}
            aria-describedby={describedBy(
              ids.detailsCount,
              fieldErrors.details && ids.detailsError,
              showPrivacyReminder && ids.privacy
            )}
          />
          <div className="wall-composer__meta-row">
            <FieldError id={ids.detailsError} message={fieldErrors.details} />
            <CharCount id={ids.detailsCount} value={body} max={fitMaxLength} />
          </div>
        </div>
        <div className="wall-composer__field">
          <label htmlFor={ids.resume}>Resume link (optional)</label>
          <input
            id={ids.resume}
            ref={setFieldRef("resume")}
            className="input"
            type="url"
            inputMode="url"
            autoComplete="url"
            value={referralResumeLink}
            onChange={(e) => {
              setReferralResumeLink(e.target.value);
              clearFieldError("resume");
            }}
            placeholder="https://…"
            maxLength={2048}
            aria-invalid={fieldErrors.resume ? true : undefined}
            aria-describedby={describedBy(fieldErrors.resume && ids.resumeError)}
          />
          <FieldError id={ids.resumeError} message={fieldErrors.resume} />
        </div>
        <p className="wall-composer__fixed-topic">
          <span className="wall-composer__section-label">Topic</span>
          <span className="wall-composer__topic-pill">{WALL_TOPIC_FAMILY_LABEL.careers}</span>
        </p>
      </div>
    );

    return (
      <CareerIntentFlowChrome
        ariaLabel={dialogAriaLabel}
        onRequestClose={requestClose}
        step={step}
        composeStepLabel="Write"
        stepsAriaLabel={isReferral ? "Referral ask steps" : "Post steps"}
        closeAriaLabel={isReferral ? "Close referral flow" : "Close post composer"}
        variant="composer"
        title={headerTitle}
      >
        <div ref={rootRef} className="wall-composer">
          <div className="wall-composer__scroll" inert={confirmDiscard}>
            <p id={ids.visibility} className="wall-composer__visibility">
              <span className="wall-composer__visibility-dot" aria-hidden="true" />
              {WALL_COMPOSER_VISIBILITY_LINE}
            </p>

            {step === "compose" ? (isReferral ? referralFields : generalFields) : null}

            {step === "compose" && showPrivacyReminder ? (
              <p id={ids.privacy} className="wall-composer__privacy" role="status">
                {WALL_COMPOSER_PRIVACY_REMINDER}
              </p>
            ) : null}

            {step === "preview" ? (
              <section className="wall-composer__preview" aria-labelledby={`${uid}-preview-heading`}>
                <h3
                  id={`${uid}-preview-heading`}
                  ref={previewHeadingRef}
                  tabIndex={-1}
                  className="wall-composer__preview-heading"
                >
                  Preview
                </h3>
                <p className="wall-composer__preview-sub">This is how your post will appear on the Wall.</p>
                <p className="wall-composer__preview-meta">
                  <span className="wall-composer__section-label">Topic</span>
                  <span className="wall-composer__topic-pill">{topic ? WALL_TOPIC_FAMILY_LABEL[topic] : ""}</span>
                </p>
                {/* `home-ideal__opportunities` applies the Wall's own card styles, so the preview matches the feed. */}
                <div className="wall-composer__preview-card home-ideal__opportunities" inert aria-label="Post preview">
                  {previewRow ? (
                    <IntentcastActivityRowsList
                      rows={[previewRow]}
                      viewerPersonId={viewer.personId}
                      deleteSubmittingId={null}
                      onRequestDelete={() => undefined}
                      ownerDeleteMenu={false}
                    />
                  ) : null}
                </div>
                {publishError ? (
                  <div className="wall-composer__publish-error" role="alert">
                    <p>{publishError}</p>
                    <p className="wall-composer__publish-error-sub">Your post is still here. Nothing was lost.</p>
                    <button
                      type="button"
                      className="wall-composer__text-btn"
                      onClick={() => void publish()}
                      disabled={submitting}
                    >
                      Try again
                    </button>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          <footer className="wall-composer__bar" inert={confirmDiscard}>
            {step === "compose" ? (
              <>
                <p className="wall-composer__bar-note">You can review your post before publishing.</p>
                <Button type="button" variant="secondary" className="wall-composer__cta" onClick={goToPreview}>
                  Preview post
                </Button>
              </>
            ) : (
              <>
                <p className="wall-composer__bar-note">Your post will go live instantly.</p>
                <div className="wall-composer__bar-actions">
                  <button
                    type="button"
                    className="wall-composer__back"
                    onClick={goBackToCompose}
                    disabled={submitting}
                  >
                    Back
                  </button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="wall-composer__cta"
                    disabled={submitting}
                    onClick={() => void publish()}
                  >
                    {submitting ? "Publishing…" : publishLabel}
                  </Button>
                </div>
              </>
            )}
          </footer>

          {confirmDiscard ? (
            <div className="wall-composer__discard" role="alertdialog" aria-labelledby={`${uid}-discard-title`}>
              <p id={`${uid}-discard-title`} className="wall-composer__discard-title">
                Discard this post?
              </p>
              <p className="wall-composer__discard-sub">What you have written will be lost.</p>
              <div className="wall-composer__bar-actions">
                <button
                  ref={keepEditingRef}
                  type="button"
                  className="wall-composer__back"
                  onClick={() => setConfirmDiscard(false)}
                >
                  Keep editing
                </button>
                <Button type="button" variant="secondary" className="wall-composer__cta" onClick={closeFlow}>
                  Discard
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </CareerIntentFlowChrome>
    );
  }
);

PostBulletinFlow.displayName = "PostBulletinFlow";
