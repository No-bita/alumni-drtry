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
import { CareerIntentFlowChrome } from "./CareerIntentFlowChrome";
import { FormActions, FormField } from "./forms";
import { ReferralIntentHeadline } from "./ReferralIntentHeadline";
import { PostAudienceField, PostAudienceLabel } from "./PostAudienceField";
import { freshAudienceChoice, toApiAudience, type AudienceChoice } from "../lib/postAudience";
import { TapPills } from "./TapPills";
import { HiringCompose } from "./broker/HiringCompose";
import { emptyHiringDraft, hiringPayload, hiringProblems, type HiringDraft } from "../lib/hiringDraft";
import { ReferralRequestFlow } from "./broker/ReferralRequestFlow";
import { BrokerProgress } from "./broker/BrokerProgress";
import { brokerKeys, type BrokerRequest } from "../lib/broker";

/** First tap in the Wall composer (one category at a time is being redesigned; Careers first). */
type TopCategory = "careers" | "relocation" | "startups" | "general";
const TOP_CATEGORY_OPTIONS: ReadonlyArray<{ value: TopCategory; label: string }> = [
  { value: "careers", label: "Careers" },
  { value: "relocation", label: "Relocation" },
  { value: "startups", label: "Startups" },
  { value: "general", label: "General" },
];
/** Careers → what you want the network to see. Referral is brokered (we ask for you), not a Wall post. */
type CareersTrack = "hiring" | "referral" | "guidance";
const CAREERS_TRACK_OPTIONS: ReadonlyArray<{ value: CareersTrack; label: string }> = [
  { value: "hiring", label: "Hiring" },
  { value: "referral", label: "Referral" },
  { value: "guidance", label: "Guidance" },
];
/** Guidance posts have no heading: the card header is this line. */
const GUIDANCE_HEADER = "Career guidance";

function topCategoryFor(category: BulletinGeneralCategory | undefined): { top: TopCategory | null; track: CareersTrack | null } {
  switch (category) {
    case "hiring":
      return { top: "careers", track: "hiring" };
    case "guidance":
      return { top: "careers", track: "guidance" };
    case "careers":
      return { top: "careers", track: null };
    case "relocation":
    case "startups":
    case "general":
      return { top: category, track: null };
    default:
      return { top: null, track: null };
  }
}

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

type ComposeErrorField = "kind" | "jobLink" | "headline" | "company" | "details" | "resume" | null;

/** Maps validateCompose/publish error copy to the field it belongs to; null keeps the dialog-level error line. */
function composeErrorField(message: string | null): ComposeErrorField {
  if (!message) return null;
  if (message.startsWith("Choose what this post")) return "kind";
  if (message.startsWith("Add the job link") || message.startsWith("Job link must")) return "jobLink";
  if (
    message.startsWith("Add a role title") ||
    message.startsWith("Role must") ||
    message.startsWith("Referral headline") ||
    message.startsWith("Add a headline") ||
    message.startsWith("Headline must")
  ) {
    return "headline";
  }
  if (message.startsWith("Add the company") || message.startsWith("Company must")) return "company";
  if (
    message.startsWith("Add why you're a fit") ||
    message.startsWith("Your fit answer") ||
    message.startsWith("Add a bit more detail") ||
    message.startsWith("Details must")
  ) {
    return "details";
  }
  if (message.startsWith("Resume Link must")) return "resume";
  return null;
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

export type PostBulletinFlowProps = {
  onPublishSuccess?: (intentcast: IntentcastFeedItem) => void;
};

export type PostBulletinFlowHandle = PostBulletinFlowHandleShape;

type BulletinStep = "compose" | "preview";

const AUDIENCE_BLOCKED_MESSAGE = "No one else matches this audience yet. Remove a choice under Who can see this.";

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
    case "general":
      return "guidance";
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
    /** General composer: the tapped category (nothing until the first tap) and, for Careers, the track. */
    const [topCategory, setTopCategory] = useState<TopCategory | null>(null);
    const [careersTrack, setCareersTrack] = useState<CareersTrack | null>(null);
    const [hiringDraft, setHiringDraft] = useState<HiringDraft>(emptyHiringDraft);
    const [hiringAttempted, setHiringAttempted] = useState(false);
    /** After a hiring post with "Also ask matching alumni privately": the request's progress (or why not). */
    const [hiringDone, setHiringDone] = useState<{ request: BrokerRequest | null; note: string | null } | null>(null);
    const [referralOpen, setReferralOpen] = useState(false);
    /** Ask / Offer / Invitation: the author states what their post is (approved 19:30). Required. */
    const [kind, setKind] = useState<"" | "ask" | "offer" | "invitation">("");
    const [headline, setHeadline] = useState("");
    const [body, setBody] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    /** Careers hub presets: referrals lock to Careers (`mentorship`); Can help locks to Guidance (`guidance`). */
    const [careersPreset, setCareersPreset] = useState<CareersBulletinPreset | null>(null);
    const [referralJobLink, setReferralJobLink] = useState("");
    const [referralCompanyName, setReferralCompanyName] = useState("");
    /** Cities: the post is tagged with this city (POST /v1/intentcasts `placeId`). */
    const [placeId, setPlaceId] = useState<string | null>(null);
    const [referralResumeLink, setReferralResumeLink] = useState("");
    /** Who can see the post: Everyone each time the composer opens; fixed once posted. */
    const [housingPhotoTip, setHousingPhotoTip] = useState(false);
    const [cityTarget, setCityTarget] = useState<{ placeId: string; name: string } | undefined>();
    const [audience, setAudience] = useState<AudienceChoice>(freshAudienceChoice);
    const [audienceState, setAudienceState] = useState<{ label: string | null; blocked: boolean }>({ label: null, blocked: false });

    const composeHeadlineRef = useRef<HTMLInputElement>(null);
    const previewPanelRef = useRef<HTMLElement>(null);

    const composedContent = useMemo(() => {
      if (careersPreset === "referralSeeking") {
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
      if (careersPreset === null && topCategory === "careers" && careersTrack === "guidance") {
        const b = body.trim();
        return b ? `${GUIDANCE_HEADER}\n${b}` : "";
      }
      const h = headline.trim();
      const b = body.trim();
      if (!h && !b) return "";
      if (!b) return h;
      if (!h) return b;
      return `${h}\n${b}`;
    }, [body, careersPreset, careersTrack, headline, referralCompanyName, referralJobLink, referralResumeLink, topCategory]);

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
      setKind("");
      setHeadline("");
      setBody("");
      setReferralJobLink("");
      setReferralCompanyName("");
      setReferralResumeLink("");
      setError(null);
      setCareersPreset(null);
      setTopCategory(null);
      setCareersTrack(null);
      setHiringDraft(emptyHiringDraft());
      setHiringAttempted(false);
      setHiringDone(null);
      setPlaceId(null);
      setHousingPhotoTip(false);
      setCityTarget(undefined);
      setAudience(freshAudienceChoice());
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
      const mapped = preset ? { top: null, track: null } : topCategoryFor(options?.category);
      setTopCategory(mapped.top);
      setCareersTrack(mapped.track);
      setHiringDraft(emptyHiringDraft());
      setHiringAttempted(false);
      setHiringDone(null);
      setHeadline((options?.headline ?? "").trim().slice(0, BULLETIN_TITLE_MAX_CHARS));
      setBody((options?.body ?? "").trim().slice(0, BULLETIN_DESCRIPTION_MAX_CHARS));
      setReferralJobLink("");
      setReferralCompanyName((options?.referralCompanyName ?? "").trim().slice(0, 120));
      setReferralResumeLink("");
      setPlaceId(options?.placeId ?? null);
      setKind(options?.kind ?? "");
      setHousingPhotoTip(options?.housingPhotoTip === true);
      setCityTarget(options?.placeId ? { placeId: options.placeId, name: options.placeName ?? "This city" } : undefined);
      setAudience(options?.placeId ? { ...freshAudienceChoice(), city: true, cityPlaceId: options.placeId } : freshAudienceChoice());
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
      if (careersPreset !== null && !kind) return "Choose what this post is: an ask, an offer or an invitation.";
      if (careersPreset === "referralSeeking") {
        const jl = referralJobLink.trim();
        if (!jl) return "Add the job link for this opening.";
        if (!tryNormalizeExternalHttpUrl(jl)) return "Job link must be a valid http(s) URL.";
        if (!headlineOk) return "Add a role title (at least 3 characters).";
        const ht = headline.trim();
        const co = referralCompanyName.trim();
        const bt = body.trim();
        if (ht.length > BULLETIN_TITLE_MAX_CHARS) {
          return `Role must be at most ${BULLETIN_TITLE_MAX_CHARS} characters.`;
        }
        if (!co) return "Add the company for this opening.";
        if (co.length > BULLETIN_TITLE_MAX_CHARS) {
          return `Company must be at most ${BULLETIN_TITLE_MAX_CHARS} characters.`;
        }
        const headLine = buildReferralIntentBulletinHeadline(ht, co);
        if (headLine.length > BULLETIN_TITLE_MAX_CHARS) {
          return `Referral headline is too long (max ${BULLETIN_TITLE_MAX_CHARS} characters). Shorten the role or company.`;
        }
        if (!bt) return "Add why you're a fit for this role.";
        if (bt.length > BULLETIN_DESCRIPTION_MAX_CHARS) {
          return `Your fit answer must be at most ${BULLETIN_DESCRIPTION_MAX_CHARS} characters.`;
        }
        const rr = referralResumeLink.trim();
        if (rr) {
          const norm = tryNormalizeExternalHttpUrl(rr);
          if (!norm) return "Resume Link must be a valid http(s) URL.";
        }
        const content = composedContent.trim();
        if (content.length < 10) return "Add a bit more detail (10 characters minimum)";
        const generalErr = validateGeneralBulletinHeadlineDetails(content);
        if (generalErr) {
          return "Your fit answer, job link and resume link together are too long — shorten the fit answer.";
        }
        return null;
      }
      if (topCategory === "careers" && careersTrack === "guidance") {
        const bt = body.trim();
        if (bt.length < 10) return "Add a bit more detail (10 characters minimum)";
        if (bt.length > BULLETIN_DESCRIPTION_MAX_CHARS) return `Details must be at most ${BULLETIN_DESCRIPTION_MAX_CHARS} characters.`;
        return null;
      }
      if (!topCategory) return "Choose what this is about.";
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
      if (content.length < 10) return "Add a bit more detail (10 characters minimum)";
      return validateGeneralBulletinHeadlineDetails(content);
    }, [
      body,
      careersPreset,
      composedContent,
      headline,
      headlineOk,
      kind,
      careersTrack,
      topCategory,
      referralCompanyName,
      referralJobLink,
      referralResumeLink,
    ]);

    const goToPreview = useCallback(() => {
      const err = validateCompose() ?? (audienceState.blocked ? AUDIENCE_BLOCKED_MESSAGE : null);
      if (err) {
        setError(err);
        return;
      }
      setError(null);
      setStep("preview");
    }, [validateCompose, audienceState.blocked]);

    const goBackToCompose = useCallback(() => {
      setError(null);
      setStep("compose");
    }, []);

    const publish = useCallback(async () => {
      const err = validateCompose() ?? (audienceState.blocked ? AUDIENCE_BLOCKED_MESSAGE : null);
      if (err) {
        setError(err);
        return;
      }
      const uiCategory: BulletinGeneralCategory =
        careersPreset !== null ? category : topCategory === "careers" ? "guidance" : (topCategory ?? category);
      const content = encodeBulletinContentWithUiCategory(composedContent.trim(), uiCategory);
      setError(null);
      setSubmitting(true);
      const { data, error: apiErr } = await api.post<{ intentcast: IntentcastFeedItem }>("/v1/intentcasts", {
        category: bulletinUiCategoryToApiCategory(uiCategory),
        ...(careersPreset !== null ? { kind } : kind ? { kind } : {}),
        content,
        ...(placeId ? { placeId } : {}),
        ...(toApiAudience(audience) ? { audience: toApiAudience(audience) } : {}),
      });
      setSubmitting(false);
      if (apiErr || !data?.intentcast) {
        setError(apiErr?.message ?? apiErr?.code ?? "Couldn't publish. Try again.");
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.feedQueries() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.detail(data.intentcast.id) });
      onPublishSuccess?.(data.intentcast);
      closeFlow();
    }, [audience, audienceState.blocked, category, careersPreset, closeFlow, composedContent, kind, onPublishSuccess, placeId, queryClient, topCategory, validateCompose]);

    const myCity = auth.status === "authenticated" ? auth.myProfile?.residenceCity?.trim() || null : null;

    /** Careers → Hiring: post the tapped answers (no heading), then optionally ask matching alumni privately. */
    const publishHiring = useCallback(async () => {
      setHiringAttempted(true);
      if (hiringProblems(hiringDraft).length > 0) return;
      if (audienceState.blocked) {
        setError(AUDIENCE_BLOCKED_MESSAGE);
        return;
      }
      setError(null);
      setSubmitting(true);
      const { data, error: apiErr } = await api.post<{ intentcast: IntentcastFeedItem }>("/v1/intentcasts", {
        category: "hiring",
        content: hiringDraft.body.trim(),
        hiring: hiringPayload(hiringDraft, myCity),
        ...(placeId ? { placeId } : {}),
        ...(toApiAudience(audience) ? { audience: toApiAudience(audience) } : {}),
      });
      if (apiErr || !data?.intentcast) {
        setSubmitting(false);
        setError(apiErr?.message ?? apiErr?.code ?? "Couldn't publish. Try again.");
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.feedQueries() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.detail(data.intentcast.id) });
      onPublishSuccess?.(data.intentcast);
      if (!hiringDraft.askPrivately) {
        setSubmitting(false);
        closeFlow();
        return;
      }
      const asked = await api.post<{ request: BrokerRequest }>("/v1/broker-requests", { kind: "hiring", intentcastId: data.intentcast.id });
      setSubmitting(false);
      void queryClient.invalidateQueries({ queryKey: brokerKeys.all });
      setHiringDone(
        asked.data?.request
          ? { request: asked.data.request, note: null }
          : { request: null, note: asked.error?.message ?? "Your post is on the Wall, but we couldn't ask alumni privately. Try again later." }
      );
    }, [audience, audienceState.blocked, closeFlow, hiringDraft, myCity, onPublishSuccess, placeId, queryClient]);

    const errorField = composeErrorField(error);

    const dialogAriaLabel =
      careersPreset === "referralSeeking"
        ? step === "compose"
          ? "Ask alumni for a referral, step 1 of 2: Write"
          : "Ask alumni for a referral, step 2 of 2: Preview"
        : careersPreset === "canHelp"
          ? step === "compose"
            ? "Offer help to alumni, step 1 of 2: Write"
            : "Offer help to alumni, step 2 of 2: Preview"
          : step === "compose"
            ? "Share with alumni, step 1 of 2: Write"
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
          : "Advice on becoming a manager";

    const referralCompanyPlaceholder = "Razorpay";
    const referralJobLinkPlaceholder = "https://company.com/jobs/…";

    const detailsPlaceholder =
      careersPreset === "referralSeeking"
        ? "The experience that makes you a fit for this role."
        : careersPreset === "canHelp"
          ? "Teams or roles you can support, geography, seniority, and how someone should reach out."
          : "What you’ve tried, what you need, and how alumni can respond.";

    const detailsMaxChars =
      careersPreset === "referralSeeking"
        ? Math.max(
            0,
            BULLETIN_DESCRIPTION_MAX_CHARS -
              referralSeekingLinkLines(referralJobLink, referralResumeLink).join("\n\n").length -
              2
          )
        : BULLETIN_DESCRIPTION_MAX_CHARS;

    const publishLabel =
      careersPreset === "referralSeeking"
        ? "Publish"
        : careersPreset === "canHelp"
          ? "Publish offer"
          : "Publish";

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

    if (referralOpen) return <ReferralRequestFlow onClose={() => setReferralOpen(false)} />;
    if (!open || !viewer) return null;

    const generalFlow = !careersHubFlow;
    const hiringTrack = generalFlow && topCategory === "careers" && careersTrack === "hiring";
    const guidanceTrack = generalFlow && topCategory === "careers" && careersTrack === "guidance";
    /** Headline + details (the categories not redesigned yet, and the Careers hub presets). */
    const classicFields = careersHubFlow || (topCategory !== null && topCategory !== "careers");
    const awaitingTap = generalFlow && (topCategory === null || (topCategory === "careers" && careersTrack === null));

    return (
      <CareerIntentFlowChrome
        ariaLabel={dialogAriaLabel}
        onRequestClose={closeFlow}
        step={step}
        stepsAriaLabel={stepsAriaLabel}
        closeAriaLabel={closeAriaLabel}
        composeStepLabel="Write"
        title={careersHubFlow ? undefined : "Post to the Wall"}
        hideSteps={!careersHubFlow}
        blurOverlay={!careersHubFlow}
      >
        <div className="career-hiring-flow__layout career-hiring-flow__layout--review">
          <div className="career-hiring-flow__main ds-surface-card">
            {hiringDone ? (
              <div className="career-hiring-flow__preview-stack" role="status">
                <p className="career-hiring-flow__eyebrow">Posted</p>
                {hiringDone.request ? (
                  <>
                    <p className="broker-note">
                      Your role is on the Wall, and we&apos;ve privately asked {hiringDone.request.askedCount} matching{" "}
                      {hiringDone.request.askedCount === 1 ? "alum" : "alumni"}.
                    </p>
                    <BrokerProgress request={hiringDone.request} />
                  </>
                ) : (
                  <p className="broker-note broker-note--warn">{hiringDone.note}</p>
                )}
                <FormActions primary={{ label: "Done", onClick: closeFlow }} />
              </div>
            ) : null}
            {step === "compose" && !hiringDone ? (
              <>
                <div className="career-hiring-flow__grid">
                  {careersHubFlow ? (
                    <FormField
                      label="What is this?"
                      required
                      error={errorField === "kind" ? error : undefined}
                      className="career-hiring-flow__field--wide"
                    >
                      <select
                        className="input"
                        value={kind}
                        onChange={(e) => setKind(e.target.value as "ask" | "offer" | "invitation")}
                      >
                        <option value="" disabled>
                          Choose one
                        </option>
                        <option value="ask">Ask — I need something</option>
                        <option value="offer">Offer — I’m offering something</option>
                        <option value="invitation">Invitation — join me for something</option>
                      </select>
                    </FormField>
                  ) : null}
                  {generalFlow ? (
                    <div className="career-hiring-flow__field--wide">
                      <TapPills
                        label="What's this about?"
                        options={TOP_CATEGORY_OPTIONS}
                        value={topCategory}
                        onChange={(top) => {
                          setTopCategory(top);
                          setCareersTrack(null);
                          setError(null);
                          if (top !== "careers") setCategory(top);
                        }}
                      />
                    </div>
                  ) : null}
                  {generalFlow && topCategory === "careers" ? (
                    <div className="career-hiring-flow__field--wide broker-step-in">
                      <TapPills
                        label="What do you need?"
                        hint={careersTrack === null ? "Referral: we ask alumni at the company for you and connect you with whoever says yes." : undefined}
                        options={CAREERS_TRACK_OPTIONS}
                        value={careersTrack}
                        onChange={(track) => {
                          setError(null);
                          if (track === "referral") {
                            closeFlow();
                            setReferralOpen(true);
                            return;
                          }
                          setCareersTrack(track);
                          setCategory(track === "hiring" ? "hiring" : "guidance");
                        }}
                      />
                    </div>
                  ) : null}
                  {hiringTrack ? (
                    <div className="career-hiring-flow__field--wide broker-step-in">
                      <HiringCompose draft={hiringDraft} onChange={setHiringDraft} myCity={myCity} attempted={hiringAttempted} />
                    </div>
                  ) : null}
                  {guidanceTrack ? (
                    <div className="career-hiring-flow__field--wide broker-step-in">
                      <FormField label="Details" required error={errorField === "details" ? error : undefined} controlId="post-bulletin-guidance">
                        <div className="career-hiring-flow__textarea-wrap">
                          <textarea
                            id="post-bulletin-guidance"
                            className="input input--textarea"
                            rows={5}
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder="Give context (current role, years of experience, the exact dilemma) so alumni can give sharp advice."
                            maxLength={BULLETIN_DESCRIPTION_MAX_CHARS}
                          />
                          <p className="career-hiring-flow__counter career-hiring-flow__counter--inside" aria-live="polite">
                            {body.length} / {BULLETIN_DESCRIPTION_MAX_CHARS}
                          </p>
                        </div>
                      </FormField>
                    </div>
                  ) : null}
                  {classicFields ? (<>
                  {careersPreset === "referralSeeking" ? (
                    <FormField
                      label="Job link"
                      required
                      error={errorField === "jobLink" ? error : undefined}
                      className="career-hiring-flow__field--wide"
                    >
                      <input
                        className="input"
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        value={referralJobLink}
                        onChange={(e) => setReferralJobLink(e.target.value)}
                        placeholder={referralJobLinkPlaceholder}
                        maxLength={2048}
                      />
                    </FormField>
                  ) : null}
                  <FormField
                    label={careersPreset === "referralSeeking" ? "Role" : "Headline"}
                    required
                    error={errorField === "headline" ? error : undefined}
                    controlId="post-bulletin-headline"
                    className="career-hiring-flow__field--wide"
                  >
                    <div className="career-hiring-flow__textarea-wrap">
                      <input
                        id="post-bulletin-headline"
                        ref={composeHeadlineRef}
                        className="input"
                        value={headline}
                        onChange={(e) => setHeadline(e.target.value)}
                        placeholder={headlinePlaceholder}
                        maxLength={BULLETIN_TITLE_MAX_CHARS}
                        autoComplete="off"
                      />
                      <p className="career-hiring-flow__counter career-hiring-flow__counter--inside" aria-live="polite">
                        {headline.length} / {BULLETIN_TITLE_MAX_CHARS}
                      </p>
                    </div>
                  </FormField>
                  {careersPreset === "referralSeeking" ? (
                    <FormField
                      label="Company"
                      required
                      error={errorField === "company" ? error : undefined}
                      className="career-hiring-flow__field--wide"
                    >
                      <input
                        className="input"
                        value={referralCompanyName}
                        onChange={(e) => setReferralCompanyName(e.target.value)}
                        placeholder={referralCompanyPlaceholder}
                        maxLength={BULLETIN_TITLE_MAX_CHARS}
                        autoComplete="organization"
                      />
                    </FormField>
                  ) : null}
                  <FormField
                    label={careersPreset === "referralSeeking" ? "Why are you a fit for this role?" : "Details"}
                    required
                    error={errorField === "details" ? error : undefined}
                    controlId={careersHubFlow ? undefined : "post-bulletin-details"}
                    className="career-hiring-flow__field--wide"
                  >
                    {careersHubFlow ? (
                      <textarea
                        className="input input--textarea"
                        rows={4}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder={detailsPlaceholder}
                        maxLength={detailsMaxChars}
                      />
                    ) : (
                      <div className="career-hiring-flow__textarea-wrap">
                        <textarea
                          id="post-bulletin-details"
                          className="input input--textarea"
                          rows={4}
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                          placeholder={detailsPlaceholder}
                          maxLength={detailsMaxChars}
                        />
                        <p className="career-hiring-flow__counter career-hiring-flow__counter--inside" aria-live="polite">
                          {body.length} / {detailsMaxChars}
                        </p>
                      </div>
                    )}
                  </FormField>
                  {careersPreset === "referralSeeking" ? (
                    <FormField
                      label="Resume link"
                      error={errorField === "resume" ? error : undefined}
                      className="career-hiring-flow__field--wide"
                    >
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
                    </FormField>
                  ) : null}
                  </>) : null}
                </div>
                {housingPhotoTip && !careersHubFlow ? (
                  <p className="career-hiring-flow__photo-tip">
                    <strong>Have photos to share?</strong>
                    Upload photos to a Google Drive folder. Set &quot;Anyone with the link&quot; to Viewer and paste the link in Details. Anyone with that link can view the photos.
                  </p>
                ) : null}
                {awaitingTap ? null : (
                  <PostAudienceField cityTarget={cityTarget} value={audience} onChange={setAudience} onStateChange={setAudienceState} />
                )}
                {careersHubFlow ? (
                  <FormActions primary={{ label: "Preview", onClick: goToPreview }} />
                ) : hiringTrack ? (
                  <FormActions
                    secondary={{ label: "Cancel", onClick: closeFlow }}
                    primary={{
                      label: submitting ? "Posting…" : hiringDraft.askPrivately ? "Post and ask alumni" : "Post",
                      disabled: submitting,
                      onClick: () => void publishHiring(),
                    }}
                  />
                ) : awaitingTap ? (
                  <FormActions secondary={{ label: "Cancel", onClick: closeFlow }} primary={{ label: "Next", disabled: true, onClick: () => undefined }} />
                ) : (
                  <FormActions
                    secondary={{ label: "Cancel", onClick: closeFlow }}
                    primary={{ label: "Preview", onClick: goToPreview }}
                  />
                )}
              </>
            ) : null}

            {step === "preview" ? (
              <div className="career-hiring-flow__preview-stack">
                {careersHubFlow ? null : <p className="career-hiring-flow__eyebrow">Preview</p>}
                <article
                  ref={previewPanelRef}
                  tabIndex={-1}
                  className="career-hiring-flow__preview ds-surface-card"
                  aria-label="Bulletin card preview"
                >
                  <CareersActivityPostPreview {...careersActivityPreview} />
                  <PostAudienceLabel label={audienceState.label} />
                </article>
              </div>
            ) : null}

            {error && errorField === null ? (
              <p className="career-hiring-flow__error" role="alert">
                {error}
              </p>
            ) : null}

            {step === "preview" ? (
              <>
                <FormActions
                  secondary={{ label: careersHubFlow ? "Back" : "Edit", onClick: goBackToCompose }}
                  primary={{ label: submitting ? "Publishing…" : publishLabel, disabled: submitting, onClick: () => void publish() }}
                />
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
