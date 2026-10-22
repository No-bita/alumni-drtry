import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
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
  splitBulletinPostBody,
  validateGeneralBulletinHeadlineDetails,
} from "../lib/bulletinPostCardUtils";
import {
  extractStructuredCareerRoleLink,
  hiringCompensationChipFromParsed,
  hiringExperienceChipFromParsed,
  parseHiringBulletin,
  promoteBareLeadingListingToResumeForReferral,
  stripHiringTailChipDuplicateProse,
  stripStructuredHiringTailMeta,
} from "../lib/parseHiringBulletin";
import { queryKeys } from "../lib/queryKeys";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "./Button";
import { CareerIntentFlowChrome } from "./CareerIntentFlowChrome";
import { ReferralIntentHeadline } from "./ReferralIntentHeadline";

/** Accepts absolute http(s) URLs or host/path — normalized for stored `Resume link:` lines. */
function tryNormalizeExternalHttpUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const candidate = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

function referralSeekingDetailsBlock(aboutYou: string, resumeRaw: string): string {
  const details = aboutYou.trim();
  const resumeNorm =
    resumeRaw.trim().length > 0 ? tryNormalizeExternalHttpUrl(resumeRaw) : null;
  const resumeLine = resumeNorm ? `Resume link: ${resumeNorm}` : "";
  if (!details && !resumeLine) return "";
  if (!resumeLine) return details;
  if (!details) return resumeLine;
  return `${details}\n\n${resumeLine}`;
}

export type PostBulletinFlowProps = {
  onPublishSuccess?: (intentcast: IntentcastFeedItem) => void;
};

export type PostBulletinFlowHandle = PostBulletinFlowHandleShape;

type BulletinStep = "compose" | "preview";

const INITIAL_CATEGORY: BulletinGeneralCategory = "guidance";

type CareersActivityPreviewProps = {
  role: string;
  companyLoc: string | null;
  description: string;
  chips: readonly string[];
  listingUrl: string | null;
  resumeUrl: string | null;
};

/** Matches Careers activity preview: headline → optional meta → description → chips → optional links. Referrals use one headline line (`Looking for referral for …`). */
function CareersActivityPostPreview({
  role,
  companyLoc,
  description,
  chips,
  listingUrl,
  resumeUrl,
}: CareersActivityPreviewProps) {
  return (
    <>
      <ReferralIntentHeadline as="p" className="career-hiring-flow__preview-title" headline={role} />
      {companyLoc ? <p className="career-hiring-flow__preview-meta">{companyLoc}</p> : null}
      {description.trim() ? <p className="career-hiring-flow__preview-copy">{description}</p> : null}
      {listingUrl ? (
        <p className="career-hiring-flow__preview-note">
          <a href={listingUrl} target="_blank" rel="noopener noreferrer">
            Role link
          </a>
        </p>
      ) : null}
      {resumeUrl ? (
        <p className="career-hiring-flow__preview-note">
          <a href={resumeUrl} target="_blank" rel="noopener noreferrer">
            Resume link
          </a>
        </p>
      ) : null}
      {chips.length > 0 ? (
        <div className="career-hiring-flow__preview-chips">
          {chips.map((c, i) => (
            <span key={`${c}-${i}`}>{c}</span>
          ))}
        </div>
      ) : null}
    </>
  );
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

export const PostBulletinFlow = forwardRef<PostBulletinFlowHandle, PostBulletinFlowProps>(
  function PostBulletinFlow({ onPublishSuccess }, ref) {
    const auth = useAuth();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<BulletinStep>("compose");
    const [category, setCategory] = useState<BulletinGeneralCategory>(INITIAL_CATEGORY);
    const [headline, setHeadline] = useState("");
    const [body, setBody] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    /** Careers hub presets: referrals lock to Careers (`mentorship`); Can help locks to Guidance (`guidance`). */
    const [careersPreset, setCareersPreset] = useState<CareersBulletinPreset | null>(null);
    const [referralCompanyName, setReferralCompanyName] = useState("");
    const [referralResumeLink, setReferralResumeLink] = useState("");

    const composeHeadlineRef = useRef<HTMLInputElement>(null);
    const previewPanelRef = useRef<HTMLElement>(null);

    const composedContent = useMemo(() => {
      if (careersPreset === "referralSeeking") {
        const role = headline.trim();
        const company = referralCompanyName.trim();
        const detailsBlock = referralSeekingDetailsBlock(body, referralResumeLink);
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
    }, [body, careersPreset, headline, referralCompanyName, referralResumeLink]);

    const previewSplit = useMemo(
      () => splitBulletinPostBody(composedContent || headline || "Preview headline"),
      [composedContent, headline]
    );

    const careersActivityPreview = useMemo((): CareersActivityPreviewProps => {
      const raw = composedContent.trim();
      const split = previewSplit;
      if (!raw) {
        if (careersPreset === "referralSeeking") {
          const ht = headline.trim();
          const co = referralCompanyName.trim();
          return {
            role: buildReferralIntentBulletinHeadline(ht || "Role", co),
            companyLoc: null,
            description: body.trim(),
            chips: [],
            listingUrl: null,
            resumeUrl: tryNormalizeExternalHttpUrl(referralResumeLink),
          };
        }
        return {
          role: split.title.trim() || "Headline",
          companyLoc: null,
          description: (split.summary ?? "").trim(),
          chips: [],
          listingUrl: null,
          resumeUrl: null,
        };
      }
      if (careersPreset === "referralSeeking") {
        const parsedReferral = parseHiringBulletin(raw);
        if (parsedReferral) {
          const coerced = promoteBareLeadingListingToResumeForReferral(
            extractStructuredCareerRoleLink(parsedReferral.description)
          );
          const proseTail = stripStructuredHiringTailMeta(
            stripHiringTailChipDuplicateProse(coerced.proseAfterLink)
          ).trim();
          const descriptionText = proseTail || (split.summary ?? "").trim();
          const chips = [
            parsedReferral.employmentLabel,
            hiringExperienceChipFromParsed(parsedReferral.experienceLabel),
            hiringCompensationChipFromParsed(parsedReferral.salaryLabel),
          ].filter((x): x is string => Boolean(x)).slice(0, 3);
          return {
            role: buildReferralIntentBulletinHeadline(
              parsedReferral.title.trim() || headline.trim() || "Role",
              parsedReferral.company.trim()
            ),
            companyLoc: null,
            description: descriptionText,
            chips,
            listingUrl: coerced.listingUrl,
            resumeUrl:
              coerced.resumeUrl ?? tryNormalizeExternalHttpUrl(referralResumeLink),
          };
        }
        const ht = headline.trim();
        const co = referralCompanyName.trim();
        const summaryRaw = (split.summary ?? "").trim();
        const coercedTail = promoteBareLeadingListingToResumeForReferral(
          extractStructuredCareerRoleLink(summaryRaw)
        );
        const proseTail = stripStructuredHiringTailMeta(
          stripHiringTailChipDuplicateProse(coercedTail.proseAfterLink)
        ).trim();
        const descriptionText = proseTail || body.trim();
        return {
          role: split.title.trim() || buildReferralIntentBulletinHeadline(ht || "Role", co),
          companyLoc: null,
          description: descriptionText,
          chips: [],
          listingUrl: coercedTail.listingUrl,
          resumeUrl:
            coercedTail.resumeUrl ?? tryNormalizeExternalHttpUrl(referralResumeLink),
        };
      }
      const parsed = parseHiringBulletin(raw);
      if (parsed) {
        const coerced = promoteBareLeadingListingToResumeForReferral(
          extractStructuredCareerRoleLink(parsed.description)
        );
        const proseTail = stripStructuredHiringTailMeta(
          stripHiringTailChipDuplicateProse(coerced.proseAfterLink)
        ).trim();
        const descriptionText = proseTail || (split.summary ?? "").trim();
        const chips = [
          parsed.employmentLabel,
          hiringExperienceChipFromParsed(parsed.experienceLabel),
          hiringCompensationChipFromParsed(parsed.salaryLabel),
        ].filter((x): x is string => Boolean(x)).slice(0, 3);
        const companyLoc =
          [parsed.company.trim(), parsed.locationLine.trim()].filter(Boolean).join(" | ") || null;
        return {
          role: parsed.title.trim() || split.title.trim() || "Headline",
          companyLoc,
          description: descriptionText,
          chips,
          listingUrl: coerced.listingUrl,
          resumeUrl: coerced.resumeUrl,
        };
      }
      return {
        role: split.title.trim() || "Headline",
        companyLoc: null,
        description: (split.summary ?? "").trim(),
        chips: [],
        listingUrl: null,
        resumeUrl: null,
      };
    }, [
      body,
      careersPreset,
      composedContent,
      headline,
      previewSplit,
      referralCompanyName,
      referralResumeLink,
    ]);

    const reset = useCallback(() => {
      setStep("compose");
      setCategory(INITIAL_CATEGORY);
      setHeadline("");
      setBody("");
      setReferralCompanyName("");
      setReferralResumeLink("");
      setError(null);
      setCareersPreset(null);
    }, []);

    const closeFlow = useCallback(() => {
      setOpen(false);
      reset();
    }, [reset]);

    const openFlow = useCallback((options?: PostBulletinOpenOptions) => {
      let preset: CareersBulletinPreset | null = options?.careersPreset ?? null;
      if (!preset && options?.referralSeeking === true) preset = "referralSeeking";
      setCareersPreset(preset);
      setStep("compose");
      setCategory(
        preset === "canHelp"
          ? "guidance"
          : preset === "referralSeeking"
            ? "careers"
            : options?.category ?? INITIAL_CATEGORY
      );
      setHeadline("");
      setBody("");
      setReferralCompanyName("");
      setReferralResumeLink("");
      setError(null);
      setOpen(true);
    }, []);

    const careersHubFlow = careersPreset !== null;

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
            fullName:
              (auth.myProfile?.fullName ?? "").trim() || auth.myProfile?.fullName?.trim() || "You",
            dept: auth.myProfile?.departmentCode ?? null,
            batchYear: auth.myProfile?.batchYear ?? null,
          }
        : null;

    const headlineOk = headline.trim().length >= 3;

    const validateCompose = useCallback((): string | null => {
      if (careersPreset === "referralSeeking") {
        if (!headlineOk) return "Add a role title (at least 3 characters).";
        const ht = headline.trim();
        const co = referralCompanyName.trim();
        const bt = body.trim();
        if (ht.length > BULLETIN_TITLE_MAX_CHARS) {
          return `Role must be at most ${BULLETIN_TITLE_MAX_CHARS} characters.`;
        }
        if (co.length > BULLETIN_TITLE_MAX_CHARS) {
          return `Company must be at most ${BULLETIN_TITLE_MAX_CHARS} characters.`;
        }
        const headLine = buildReferralIntentBulletinHeadline(ht, co);
        if (headLine.length > BULLETIN_TITLE_MAX_CHARS) {
          return `Referral headline is too long (max ${BULLETIN_TITLE_MAX_CHARS} characters). Shorten the role or company.`;
        }
        if (bt.length > BULLETIN_DESCRIPTION_MAX_CHARS) {
          return `About You must be at most ${BULLETIN_DESCRIPTION_MAX_CHARS} characters.`;
        }
        const rr = referralResumeLink.trim();
        if (rr) {
          const norm = tryNormalizeExternalHttpUrl(rr);
          if (!norm) return "Resume Link must be a valid http(s) URL.";
        }
        const content = composedContent.trim();
        if (content.length < 10) return "Add a bit more detail — posts must be at least 10 characters.";
        return validateGeneralBulletinHeadlineDetails(content);
      }
      if (!headlineOk) return "Add a headline (at least 3 characters).";
      const ht = headline.trim();
      const bt = body.trim();
      if (ht.length > BULLETIN_TITLE_MAX_CHARS) {
        return `Headline must be at most ${BULLETIN_TITLE_MAX_CHARS} characters.`;
      }
      if (bt.length > BULLETIN_DESCRIPTION_MAX_CHARS) {
        return `Details must be at most ${BULLETIN_DESCRIPTION_MAX_CHARS} characters.`;
      }
      const content = composedContent.trim();
      if (content.length < 10) return "Add a bit more detail — posts must be at least 10 characters.";
      return validateGeneralBulletinHeadlineDetails(content);
    }, [
      body,
      careersPreset,
      composedContent,
      headline,
      headlineOk,
      referralCompanyName,
      referralResumeLink,
    ]);

    const goToPreview = useCallback(() => {
      const err = validateCompose();
      if (err) {
        setError(err);
        return;
      }
      setError(null);
      setStep("preview");
    }, [validateCompose]);

    const goBackToCompose = useCallback(() => {
      setError(null);
      setStep("compose");
    }, []);

    const publish = useCallback(async () => {
      const err = validateCompose();
      if (err) {
        setError(err);
        return;
      }
      const content = encodeBulletinContentWithUiCategory(composedContent.trim(), category);
      setError(null);
      setSubmitting(true);
      const { data, error: apiErr } = await api.post<{ intentcast: IntentcastFeedItem }>("/v1/intentcasts", {
        category: bulletinUiCategoryToApiCategory(category),
        content,
      });
      setSubmitting(false);
      if (apiErr || !data?.intentcast) {
        setError(apiErr?.message ?? apiErr?.code ?? "Could not publish post.");
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.feedQueries() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.detail(data.intentcast.id) });
      onPublishSuccess?.(data.intentcast);
      closeFlow();
    }, [category, closeFlow, composedContent, onPublishSuccess, queryClient, validateCompose]);

    const dialogAriaLabel =
      careersPreset === "referralSeeking"
        ? step === "compose"
          ? "Ask alumni for a referral, step 1 of 2: Compose"
          : "Ask alumni for a referral, step 2 of 2: Preview"
        : careersPreset === "canHelp"
          ? step === "compose"
            ? "Offer help to alumni, step 1 of 2: Compose"
            : "Offer help to alumni, step 2 of 2: Preview"
          : step === "compose"
            ? "Share with alumni, step 1 of 2: Compose"
            : "Share with alumni, step 2 of 2: Preview";

    const stepsAriaLabel =
      careersPreset === "referralSeeking"
        ? "Referral ask steps"
        : careersPreset === "canHelp"
          ? "Can help steps"
          : "Bulletin post steps";

    const closeAriaLabel =
      careersPreset === "referralSeeking"
        ? "Close referral flow"
        : careersPreset === "canHelp"
          ? "Close can help flow"
          : "Close bulletin flow";

    const headlinePlaceholder =
      careersPreset === "referralSeeking"
        ? "Senior Backend Engineer"
        : careersPreset === "canHelp"
          ? "Can refer into Razorpay — Backend & Platform"
          : "Looking for advice on switching from IC to EM";

    const referralCompanyPlaceholder = "Razorpay";

    const detailsPlaceholder =
      careersPreset === "referralSeeking"
        ? "Location, stage, timing, and how an alum can help."
        : careersPreset === "canHelp"
          ? "Teams or roles you can support, geography, seniority, and how someone should reach out."
          : "What you’ve tried, what you need, and how alumni can respond.";

    const publishLabel =
      careersPreset === "referralSeeking"
        ? "Publish"
        : careersPreset === "canHelp"
          ? "Publish offer"
          : "Publish post";

    useEffect(() => {
      if (!open) return;
      const id = window.requestAnimationFrame(() => {
        if (step === "compose") {
          composeHeadlineRef.current?.focus();
        } else {
          previewPanelRef.current?.focus();
        }
      });
      return () => window.cancelAnimationFrame(id);
    }, [open, step]);

    if (!open || !viewer) return null;

    return (
      <CareerIntentFlowChrome
        ariaLabel={dialogAriaLabel}
        onRequestClose={closeFlow}
        step={step}
        stepsAriaLabel={stepsAriaLabel}
        closeAriaLabel={closeAriaLabel}
      >
        <div className="career-hiring-flow__layout career-hiring-flow__layout--review">
          <div className="career-hiring-flow__main ds-surface-card">
            {step === "compose" ? (
              <>
                <div className="career-hiring-flow__grid">
                  {careersHubFlow ? null : (
                    <label className="career-hiring-flow__field career-hiring-flow__field--wide">
                      <span>Category *</span>
                      <select
                        className="input"
                        value={category}
                        onChange={(e) => setCategory(e.target.value as BulletinGeneralCategory)}
                      >
                        <option value="careers">Careers</option>
                        <option value="hiring">Hiring</option>
                        <option value="relocation">Relocation</option>
                        <option value="startups">Startups</option>
                        <option value="guidance">Guidance</option>
                      </select>
                    </label>
                  )}
                  <label className="career-hiring-flow__field career-hiring-flow__field--wide">
                    <span>{careersPreset === "referralSeeking" ? "Role *" : "Headline *"}</span>
                    <input
                      ref={composeHeadlineRef}
                      className="input"
                      value={headline}
                      onChange={(e) => setHeadline(e.target.value)}
                      placeholder={headlinePlaceholder}
                      maxLength={BULLETIN_TITLE_MAX_CHARS}
                      autoComplete="off"
                    />
                  </label>
                  {careersPreset === "referralSeeking" ? (
                    <label className="career-hiring-flow__field career-hiring-flow__field--wide">
                      <span>Company</span>
                      <input
                        className="input"
                        value={referralCompanyName}
                        onChange={(e) => setReferralCompanyName(e.target.value)}
                        placeholder={referralCompanyPlaceholder}
                        maxLength={BULLETIN_TITLE_MAX_CHARS}
                        autoComplete="organization"
                      />
                    </label>
                  ) : null}
                  <label className="career-hiring-flow__field career-hiring-flow__field--wide">
                    <span>{careersPreset === "referralSeeking" ? "About You *" : "Details *"}</span>
                    <textarea
                      className="input input--textarea"
                      rows={4}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder={detailsPlaceholder}
                      maxLength={BULLETIN_DESCRIPTION_MAX_CHARS}
                    />
                  </label>
                  {careersPreset === "referralSeeking" ? (
                    <label className="career-hiring-flow__field career-hiring-flow__field--wide">
                      <span>Resume Link</span>
                      <input
                        className="input"
                        type="url"
                        inputMode="url"
                        autoComplete="url"
                        value={referralResumeLink}
                        onChange={(e) => setReferralResumeLink(e.target.value)}
                        placeholder="https://…"
                        maxLength={2048}
                      />
                    </label>
                  ) : null}
                </div>
                <footer className="career-hiring-flow__actions">
                  <Button type="button" variant="secondary" onClick={goToPreview}>
                    Preview
                  </Button>
                </footer>
              </>
            ) : null}

            {step === "preview" ? (
              <div className="career-hiring-flow__preview-stack">
                <article
                  ref={previewPanelRef}
                  tabIndex={-1}
                  className="career-hiring-flow__preview ds-surface-card"
                  aria-label="Bulletin card preview"
                >
                  <CareersActivityPostPreview {...careersActivityPreview} />
                </article>
              </div>
            ) : null}

            {error ? (
              <p className="career-hiring-flow__error" role="alert">
                {error}
              </p>
            ) : null}

            {step === "preview" ? (
              <>
                <footer className="career-hiring-flow__actions career-hiring-flow__actions--publish">
                  <Button type="button" variant="primary" onClick={goBackToCompose}>
                    Back
                  </Button>
                  <Button type="button" variant="secondary" disabled={submitting} onClick={() => void publish()}>
                    {submitting ? "Publishing…" : publishLabel}
                  </Button>
                </footer>
                <p className="career-hiring-flow__publish-note">Your post will go live instantly.</p>
              </>
            ) : null}
          </div>
        </div>
      </CareerIntentFlowChrome>
    );
  }
);

PostBulletinFlow.displayName = "PostBulletinFlow";
