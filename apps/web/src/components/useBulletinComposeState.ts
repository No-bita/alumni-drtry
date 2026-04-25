import { useCallback, useMemo, useState } from "react";
import { buildHiringBulletinContent, validateHiringBulletinFields } from "../lib/parseHiringBulletin";

type UseBulletinComposeStateParams = {
  maxLength: number;
};

export function useBulletinComposeState({ maxLength }: UseBulletinComposeStateParams) {
  const [postOpen, setPostOpen] = useState(false);
  const [postSubmitting, setPostSubmitting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [hiringCompany, setHiringCompany] = useState("");
  const [hiringTitle, setHiringTitle] = useState("");
  const [hiringTrackChoice, setHiringTrackChoice] = useState("");
  const [hiringTrackOther, setHiringTrackOther] = useState("");
  const [hiringLocation, setHiringLocation] = useState("");
  const [hiringExperience, setHiringExperience] = useState("");
  const [hiringCompensation, setHiringCompensation] = useState("");
  const [hiringRoleSummary, setHiringRoleSummary] = useState("");
  const [hiringJdUrl, setHiringJdUrl] = useState("");
  const [hiringApplySteps, setHiringApplySteps] = useState("");

  const resetComposeFields = useCallback(() => {
    setPostError(null);
    setHiringCompany("");
    setHiringTitle("");
    setHiringTrackChoice("");
    setHiringTrackOther("");
    setHiringLocation("");
    setHiringExperience("");
    setHiringCompensation("");
    setHiringRoleSummary("");
    setHiringJdUrl("");
    setHiringApplySteps("");
  }, []);

  const openCompose = useCallback(() => {
    resetComposeFields();
    setPostOpen(true);
  }, [resetComposeFields]);

  const closeCompose = useCallback(() => {
    setPostOpen(false);
  }, []);

  const hiringComposeDetails = useMemo(() => {
    const parts: string[] = [];
    const track = (hiringTrackChoice === "other" ? hiringTrackOther : hiringTrackChoice).trim();
    const needsTrackReview = hiringTrackChoice === "other" && Boolean(hiringTrackOther.trim());
    const exp = hiringExperience.trim();
    const comp = hiringCompensation.trim();
    const summary = hiringRoleSummary.trim();
    const jd = hiringJdUrl.trim();
    const steps = hiringApplySteps.trim();

    if (track) parts.push(`Role track: ${hiringTrackChoice === "other" ? `Other (${track})` : track}.`);
    if (needsTrackReview) parts.push("Awaiting admin verification before this appears in Opportunities.");
    if (exp) parts.push(`${exp} years experience preferred.`);
    if (comp) parts.push(`Compensation: ₹${comp} LPA.`);
    if (summary) parts.push(summary);
    if (jd) parts.push(jd);
    if (steps) parts.push(`Steps to apply: ${steps}`);

    return parts.join(" ").replace(/\s+/g, " ").trim();
  }, [
    hiringApplySteps,
    hiringCompensation,
    hiringExperience,
    hiringJdUrl,
    hiringRoleSummary,
    hiringTrackChoice,
    hiringTrackOther,
  ]);

  const hiringComposeBody = useMemo(
    () =>
      buildHiringBulletinContent({
        company: hiringCompany,
        title: hiringTitle,
        location: hiringLocation,
        details: hiringComposeDetails,
      }).trim(),
    [hiringCompany, hiringTitle, hiringLocation, hiringComposeDetails]
  );

  const hiringPreviewBody = useMemo(
    () =>
      buildHiringBulletinContent({
        company: hiringCompany.trim() || "Stripe",
        title: hiringTitle.trim() || "Senior Product Manager, Payments Infrastructure",
        location: hiringLocation.trim() || "Bengaluru",
        details:
          hiringComposeDetails ||
          "5+ years experience preferred. Compensation: ₹45-60 LPA. What will this person own, and what kind of impact should they expect? https://jobs.company.com/role Steps to apply: Reply here with CV + LinkedIn + 2 lines on relevant experience.",
      }).trim(),
    [hiringCompany, hiringTitle, hiringLocation, hiringComposeDetails]
  );

  const hiringJdUrlInvalid = useMemo(() => {
    const raw = hiringJdUrl.trim();
    if (!raw) return false;
    try {
      const url = new URL(raw);
      return url.protocol !== "http:" && url.protocol !== "https:";
    } catch {
      return true;
    }
  }, [hiringJdUrl]);

  const validatePostInput = useCallback((): string | null => {
    const fieldErr = validateHiringBulletinFields({
      company: hiringCompany,
      title: hiringTitle,
      location: hiringLocation,
      details: hiringComposeDetails,
    });
    if (fieldErr) return fieldErr;
    if (!hiringTrackChoice.trim()) return "Select a track.";
    if (!hiringExperience.trim()) return "Add experience in years.";
    if (hiringTrackChoice === "other" && !hiringTrackOther.trim()) {
      return "Choose Other only when you also add a role track detail.";
    }
    if (!hiringRoleSummary.trim()) return "Add 1-2 lines about the role.";
    if (hiringJdUrl.trim() && hiringJdUrlInvalid) return "Enter a valid URL (http:// or https://).";
    if (!hiringApplySteps.trim()) return "Add clear steps to apply.";
    if (hiringComposeBody.length < 10) return "Post must be at least 10 characters.";
    if (hiringComposeBody.length > maxLength) return `Post must be at most ${maxLength} characters.`;
    return null;
  }, [
    hiringCompany,
    hiringTitle,
    hiringLocation,
    hiringComposeDetails,
    hiringTrackChoice,
    hiringExperience,
    hiringTrackOther,
    hiringRoleSummary,
    hiringJdUrl,
    hiringJdUrlInvalid,
    hiringApplySteps,
    hiringComposeBody,
    maxLength,
  ]);

  return {
    postOpen,
    setPostOpen,
    postSubmitting,
    setPostSubmitting,
    postError,
    setPostError,
    hiringCompany,
    setHiringCompany,
    hiringTitle,
    setHiringTitle,
    hiringTrackChoice,
    setHiringTrackChoice,
    hiringTrackOther,
    setHiringTrackOther,
    hiringLocation,
    setHiringLocation,
    hiringExperience,
    setHiringExperience,
    hiringCompensation,
    setHiringCompensation,
    hiringRoleSummary,
    setHiringRoleSummary,
    hiringJdUrl,
    setHiringJdUrl,
    hiringApplySteps,
    setHiringApplySteps,
    hiringComposeBody,
    hiringPreviewBody,
    hiringJdUrlInvalid,
    resetComposeFields,
    openCompose,
    closeCompose,
    validatePostInput,
  };
}
