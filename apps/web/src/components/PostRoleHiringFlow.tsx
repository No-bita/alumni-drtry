import { forwardRef, useCallback, useImperativeHandle, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "./Button";
import { HomeOpportunityRail, type HomeOpportunityItem } from "./HomeOpportunityRail";
import { useAuth } from "../contexts/AuthContext";
import { api, type IntentcastFeedItem } from "../api/client";
import { BULLETIN_POST_MAX_LENGTH } from "../constants/bulletin";
import {
  buildHiringBulletinContent,
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

type HiringStep = "essentials" | "details" | "preview";

const INITIAL_HIRING_FORM = {
  roleTitle: "",
  company: "",
  location: "",
  employmentType: "Full-time",
  summary: "",
  skills: "",
  experienceLevel: "",
  compensation: "",
  applyMethod: "",
  jdFileName: "",
  hiringManagerNote: "",
};

function hiringFormToComposeFields(form: typeof INITIAL_HIRING_FORM): HiringBulletinComposeFields {
  const summary = form.summary.trim();
  const parts: string[] = [];
  parts.push(`${form.employmentType.trim()}.`);
  if (summary) parts.push(summary);
  const skills = form.skills.trim();
  if (skills) parts.push(`Skills: ${skills}.`);
  const exp = form.experienceLevel.trim();
  if (exp) parts.push(`${exp} experience.`);
  const comp = form.compensation.trim();
  if (comp) parts.push(`Compensation: ${comp}.`);
  const apply = form.applyMethod.trim();
  if (apply) parts.push(`Steps to apply: ${apply}.`);
  const jd = form.jdFileName.trim();
  if (jd) parts.push(`JD file: ${jd}.`);
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
    const auth = useAuth();
    const queryClient = useQueryClient();
    const [hiringOpen, setHiringOpen] = useState(false);
    const [hiringStep, setHiringStep] = useState<HiringStep>("essentials");
    const [hiringError, setHiringError] = useState<string | null>(null);
    const [hiringForm, setHiringForm] = useState({ ...INITIAL_HIRING_FORM });
    const [submitting, setSubmitting] = useState(false);

    const essentialsValid = Boolean(
      hiringForm.roleTitle.trim() &&
        hiringForm.company.trim() &&
        hiringForm.location.trim() &&
        hiringForm.employmentType.trim()
    );

    const previewRoleTitle = hiringForm.roleTitle.trim() || "Role title";
    const previewCompany = hiringForm.company.trim() || "Company";
    const previewLocation = hiringForm.location.trim() || "Location";
    const previewEmploymentType = hiringForm.employmentType.trim() || "Employment type";
    const previewExperience = hiringForm.experienceLevel.trim() || "Experience";
    const previewSummary = hiringForm.summary.trim() || "Role summary will appear here.";
    const previewSkills = hiringForm.skills
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean)
      .slice(0, 3);
    const previewChips =
      previewSkills.length > 0 ? [previewExperience, ...previewSkills] : [previewExperience, "Skill", "Skill"];
    const previewAuthorName =
      auth.status === "authenticated"
        ? auth.myProfile?.fullName?.trim() || auth.person.institutionalEmail
        : "You";
    const previewAuthorPersonId = auth.status === "authenticated" ? auth.person.personId : "preview-self";
    const previewOpportunityItem: HomeOpportunityItem = {
      id: "preview-role-post",
      personId: previewAuthorPersonId,
      fullName: previewAuthorName,
      departmentCode: null,
      batchYear: null,
      postedRelative: "just now",
      title: `${previewRoleTitle} at ${previewCompany}`,
      summary: previewSummary,
      chips: [previewLocation, previewEmploymentType, ...previewChips].filter(Boolean).slice(0, 4),
      category: "hiring",
    };

    const openHiringFlow = useCallback(() => {
      setHiringOpen(true);
      setHiringStep("essentials");
      setHiringError(null);
    }, []);

    const closeHiringFlow = useCallback(() => {
      setHiringOpen(false);
      setHiringStep("essentials");
      setHiringError(null);
    }, []);

    const nextHiringStep = useCallback(() => {
      if (hiringStep === "essentials") {
        if (!essentialsValid) {
          setHiringError("Please complete all required fields in Step 1.");
          return;
        }
        setHiringError(null);
        setHiringStep("details");
        return;
      }
      if (hiringStep === "details") {
        const summary = hiringForm.summary.trim();
        if (summary.length < 10) {
          setHiringError("Add a role summary (at least 10 characters) before preview.");
          return;
        }
        setHiringError(null);
        setHiringStep("preview");
      }
    }, [essentialsValid, hiringForm.summary, hiringStep]);

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
      setHiringStep("essentials");
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
        <div className="career-hiring-flow__overlay" role="presentation" onClick={closeHiringFlow}>
          <section
            className="career-hiring-flow__dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Post a role to alumni"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="career-hiring-flow__head">
              <div className="career-hiring-flow__head-title">
                <div>
                  <h2 className="visually-hidden">Post a role to alumni</h2>
                </div>
              </div>
              <button type="button" className="career-hiring-flow__close" onClick={closeHiringFlow} aria-label="Close hiring flow">
                ×
              </button>
            </header>
            <div className="career-hiring-flow__steps" aria-label="Hiring flow steps">
              <span className={hiringStep === "essentials" ? "is-active" : "is-done"}>
                <b>{hiringStep === "essentials" ? "1" : "✓"}</b>
                <small>Essentials</small>
              </span>
              <span className={hiringStep === "details" ? "is-active" : hiringStep === "preview" ? "is-done" : ""}>
                <b>{hiringStep === "preview" ? "✓" : "2"}</b>
                <small>Role details</small>
              </span>
              <span className={hiringStep === "preview" ? "is-active" : ""}>
                <b>3</b>
                <small>Review & publish</small>
              </span>
            </div>
            <div className={`career-hiring-flow__layout${hiringStep === "preview" ? " career-hiring-flow__layout--review" : ""}`}>
              <div className="career-hiring-flow__main ds-surface-card">
                {hiringStep === "essentials" ? (
                  <>
                    <div className="career-hiring-flow__main-head">
                      <div />
                    </div>
                    <div className="career-hiring-flow__grid">
                      <label className="career-hiring-flow__field">
                        <span>Role title *</span>
                        <input
                          className="input"
                          value={hiringForm.roleTitle}
                          onChange={(e) => setHiringForm((prev) => ({ ...prev, roleTitle: e.target.value }))}
                          placeholder="Backend Engineer"
                        />
                      </label>
                      <label className="career-hiring-flow__field">
                        <span>Company *</span>
                        <input
                          className="input"
                          value={hiringForm.company}
                          onChange={(e) => setHiringForm((prev) => ({ ...prev, company: e.target.value }))}
                          placeholder="Razorpay"
                        />
                      </label>
                      <label className="career-hiring-flow__field">
                        <span>Location *</span>
                        <input
                          className="input"
                          value={hiringForm.location}
                          onChange={(e) => setHiringForm((prev) => ({ ...prev, location: e.target.value }))}
                          placeholder="Bengaluru"
                        />
                      </label>
                      <label className="career-hiring-flow__field">
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
                    </div>
                    <div className="career-hiring-flow__tip-inline">
                      <div className="career-hiring-flow__tip-row">
                        <p>Tip: Be specific with the role title to attract the right candidates.</p>
                      </div>
                      <div className="career-hiring-flow__tip-actions">
                        <Button type="button" variant="secondary" onClick={nextHiringStep}>
                          Continue →
                        </Button>
                      </div>
                    </div>
                  </>
                ) : null}
                {hiringStep === "details" ? (
                  <>
                    <div className="career-hiring-flow__main-head">
                      <div />
                    </div>
                    <div className="career-hiring-flow__grid">
                      <label className="career-hiring-flow__field">
                        <span>Skills</span>
                        <input
                          className="input"
                          value={hiringForm.skills}
                          onChange={(e) => setHiringForm((prev) => ({ ...prev, skills: e.target.value }))}
                          placeholder="Node.js, PostgreSQL, System design"
                        />
                      </label>
                      <label className="career-hiring-flow__field">
                        <span>Experience</span>
                        <input
                          className="input"
                          value={hiringForm.experienceLevel}
                          onChange={(e) => setHiringForm((prev) => ({ ...prev, experienceLevel: e.target.value }))}
                          placeholder="2-5 years"
                        />
                      </label>
                      <label className="career-hiring-flow__field">
                        <span>Compensation</span>
                        <input
                          className="input"
                          value={hiringForm.compensation}
                          onChange={(e) => setHiringForm((prev) => ({ ...prev, compensation: e.target.value }))}
                          placeholder="20-32 LPA"
                        />
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
                        <span>Upload JD</span>
                        <div className="career-hiring-flow__upload">
                          <input
                            className="input"
                            type="file"
                            accept=".pdf,.doc,.docx,.txt"
                            onChange={(e) =>
                              setHiringForm((prev) => ({
                                ...prev,
                                jdFileName: e.target.files?.[0]?.name ?? "",
                              }))
                            }
                          />
                          <small>{hiringForm.jdFileName ? `Selected: ${hiringForm.jdFileName}` : "PDF/DOC/TXT accepted"}</small>
                        </div>
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
                  </>
                ) : null}
                {hiringStep === "preview" ? (
                  <>
                    <div className="career-hiring-flow__main-head">
                      <div />
                    </div>
                    <div className="career-hiring-flow__preview-readonly" inert>
                      <HomeOpportunityRail
                        items={[previewOpportunityItem]}
                        activeCategory="hiring"
                        onCategoryChange={() => undefined}
                        categoryCounts={{ careers: 0, hiring: 1, relocation: 0, startups: 0, guidance: 0 }}
                        opportunitiesFeedLoading={false}
                      />
                    </div>
                  </>
                ) : null}
                {hiringError ? <p className="career-hiring-flow__error">{hiringError}</p> : null}
                {hiringStep !== "essentials" ? (
                  <>
                    <footer className={`career-hiring-flow__actions${hiringStep === "preview" ? " career-hiring-flow__actions--publish" : ""}`}>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => {
                          setHiringError(null);
                          setHiringStep(hiringStep === "preview" ? "details" : "essentials");
                        }}
                      >
                        Back
                      </Button>
                      {hiringStep === "preview" ? (
                        <>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={submitting}
                            onClick={() => void publishHiringPost()}
                          >
                            {submitting ? "Publishing…" : "Publish role"}
                          </Button>
                        </>
                      ) : (
                        <Button type="button" variant="secondary" onClick={nextHiringStep}>
                          Preview post
                        </Button>
                      )}
                    </footer>
                    {hiringStep === "preview" ? (
                      <p className="career-hiring-flow__publish-note">Your role will go live instantly.</p>
                    ) : null}
                  </>
                ) : null}
              </div>
              {hiringStep !== "preview" ? (
                <aside className="career-hiring-flow__side ds-surface-card" aria-label="Preview">
                  <p className="career-hiring-flow__side-title">Preview</p>
                  <article className="career-hiring-flow__side-card">
                    <div className="career-hiring-flow__side-brand">
                      <span>{previewCompany.slice(0, 1).toUpperCase()}</span>
                      <div>
                        <p>{previewCompany}</p>
                      </div>
                    </div>
                    <p className="career-hiring-flow__side-role">{previewRoleTitle}</p>
                    <p className="career-hiring-flow__side-meta">
                      {previewLocation} · {previewEmploymentType}
                    </p>
                    <div className="career-hiring-flow__side-chips">
                      {previewChips.map((chip) => (
                        <span key={chip}>{chip}</span>
                      ))}
                    </div>
                    <p className="career-hiring-flow__side-copy">{previewSummary}</p>
                  </article>
                </aside>
              ) : null}
            </div>
          </section>
        </div>
    );
  }
);
