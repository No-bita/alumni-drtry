import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type IntentcastFeedItem } from "../api/client";
import {
  BULLETIN_DESCRIPTION_MAX_CHARS,
  BULLETIN_TITLE_MAX_CHARS,
} from "../constants/bulletin";
import {
  encodeBulletinContentWithUiCategory,
  splitBulletinPostBody,
  validateGeneralBulletinHeadlineDetails,
} from "../lib/bulletinPostCardUtils";
import type { BulletinGeneralCategory, PostBulletinFlowHandleShape, PostBulletinOpenOptions } from "../lib/bulletinFlowBindings";
import { demoDisplayFullName } from "../lib/demoProfile";
import { queryKeys } from "../lib/queryKeys";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "./Button";
import { BulletinPostCard } from "./BulletinPostCard";

export type PostBulletinFlowProps = {
  onPublishSuccess?: (intentcast: IntentcastFeedItem) => void;
};

export type PostBulletinFlowHandle = PostBulletinFlowHandleShape;

type BulletinStep = "topic" | "story" | "preview";

const INITIAL_CATEGORY: BulletinGeneralCategory = "guidance";

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

function bulletinUiCategoryToTone(category: BulletinGeneralCategory) {
  switch (category) {
    case "hiring":
      return "hiring" as const;
    case "relocation":
    case "startups":
      return "moving_cities" as const;
    case "careers":
    case "guidance":
      return "referrals" as const;
  }
}

function bulletinUiCategoryBadgeLabel(category: BulletinGeneralCategory): string {
  switch (category) {
    case "careers":
      return "Careers";
    case "hiring":
      return "Hiring";
    case "relocation":
      return "Relocation";
    case "startups":
      return "Startups";
    case "guidance":
      return "Guidance";
  }
}

export const PostBulletinFlow = forwardRef<PostBulletinFlowHandle, PostBulletinFlowProps>(
  function PostBulletinFlow({ onPublishSuccess }, ref) {
    const auth = useAuth();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<BulletinStep>("topic");
    const [category, setCategory] = useState<BulletinGeneralCategory>(INITIAL_CATEGORY);
    const [headline, setHeadline] = useState("");
    const [body, setBody] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [publishSuccess, setPublishSuccess] = useState(false);

    const composedContent = useMemo(() => {
      const h = headline.trim();
      const b = body.trim();
      if (!h && !b) return "";
      if (!b) return h;
      if (!h) return b;
      return `${h}\n${b}`;
    }, [headline, body]);

    const reset = useCallback(() => {
      setStep("topic");
      setCategory(INITIAL_CATEGORY);
      setHeadline("");
      setBody("");
      setError(null);
      setPublishSuccess(false);
    }, []);

    const closeFlow = useCallback(() => {
      setOpen(false);
      reset();
    }, [reset]);

    const openFlow = useCallback((options?: PostBulletinOpenOptions) => {
      setStep("topic");
      setCategory(options?.category ?? INITIAL_CATEGORY);
      setHeadline("");
      setBody("");
      setError(null);
      setOpen(true);
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
            fullName:
              demoDisplayFullName(auth.myProfile?.fullName).trim() || auth.myProfile?.fullName?.trim() || "You",
            dept: auth.myProfile?.departmentCode ?? null,
            batchYear: auth.myProfile?.batchYear ?? null,
          }
        : null;

    const topicValid = headline.trim().length >= 3;

    const validateStory = useCallback((): string | null => {
      if (!topicValid) return "Add a headline (at least 3 characters).";
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
    }, [body, composedContent, headline, topicValid]);

    const nextStep = useCallback(() => {
      if (step === "topic") {
        if (!topicValid) {
          setError("Please add a headline before continuing.");
          return;
        }
        setError(null);
        setStep("story");
        return;
      }
      if (step === "story") {
        const err = validateStory();
        if (err) {
          setError(err);
          return;
        }
        setError(null);
        setStep("preview");
      }
    }, [step, topicValid, validateStory]);

    const handleTopicHeadlineKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        nextStep();
      },
      [nextStep]
    );

    const handleStoryDetailsKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key !== "Enter") return;
        if (!event.metaKey && !event.ctrlKey) return;
        event.preventDefault();
        nextStep();
      },
      [nextStep]
    );

    const publish = useCallback(async () => {
      const err = validateStory();
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
      setPublishSuccess(true);
      window.setTimeout(() => {
        closeFlow();
      }, 900);
    }, [category, closeFlow, composedContent, onPublishSuccess, queryClient, validateStory]);

    if (!open || !viewer) return null;

    const split = splitBulletinPostBody(composedContent || headline || "Preview headline");

    return (
      <div className="career-hiring-flow__overlay" role="presentation" onClick={closeFlow}>
        <section
          className="career-hiring-flow__dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Post to bulletin"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="career-hiring-flow__head">
            <div className="career-hiring-flow__head-title">
              <div>
                <h2 className="visually-hidden">Post to bulletin</h2>
              </div>
            </div>
            <button type="button" className="career-hiring-flow__close" onClick={closeFlow} aria-label="Close">
              ×
            </button>
          </header>

          <div className="career-hiring-flow__steps" aria-label="Bulletin post steps">
            <span className={step === "topic" ? "is-active" : "is-done"}>
              <b>{step === "topic" ? "1" : "✓"}</b>
              <small>Topic</small>
            </span>
            <span className={step === "story" ? "is-active" : step === "preview" ? "is-done" : ""}>
              <b>{step === "preview" ? "✓" : "2"}</b>
              <small>Details</small>
            </span>
            <span className={step === "preview" ? "is-active" : ""}>
              <b>3</b>
              <small>Review</small>
            </span>
          </div>

          <div className={`career-hiring-flow__layout${step === "preview" ? " career-hiring-flow__layout--review" : ""}`}>
            <div className="career-hiring-flow__main">
              {step === "topic" ? (
                <>
                  <div className="career-hiring-flow__main-head">
                    <div />
                  </div>
                  <div className="career-hiring-flow__grid">
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
                    <label className="career-hiring-flow__field career-hiring-flow__field--wide">
                      <span>Headline *</span>
                      <div className="bulletin-flow__input-wrap">
                        <input
                          className="input bulletin-flow__input-with-counter"
                          value={headline}
                          onChange={(e) => setHeadline(e.target.value)}
                          onKeyDown={handleTopicHeadlineKeyDown}
                          placeholder="e.g. Looking for advice on switching from IC to EM"
                          maxLength={BULLETIN_TITLE_MAX_CHARS}
                        />
                        <span className="bulletin-flow__counter" aria-live="polite">
                          {headline.length}/{BULLETIN_TITLE_MAX_CHARS}
                        </span>
                      </div>
                    </label>
                  </div>
                  <div className="career-hiring-flow__tip-inline">
                    <div className="career-hiring-flow__tip-row">
                      <p>Tip: One clear line beats a vague title — alumni skim headlines first.</p>
                    </div>
                    <div className="career-hiring-flow__tip-actions">
                      <Button type="button" variant="secondary" onClick={nextStep}>
                        Continue →
                      </Button>
                    </div>
                  </div>
                </>
              ) : null}

              {step === "story" ? (
                <>
                  <div className="career-hiring-flow__grid">
                    <label className="career-hiring-flow__field career-hiring-flow__field--wide">
                      <span>Details *</span>
                      <div className="bulletin-flow__input-wrap">
                        <textarea
                          className="input input--textarea bulletin-flow__input-with-counter bulletin-flow__textarea-with-counter"
                          rows={6}
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                          onKeyDown={handleStoryDetailsKeyDown}
                          placeholder="What you’ve tried, what you need, and how alumni can respond."
                          maxLength={BULLETIN_DESCRIPTION_MAX_CHARS}
                        />
                        <span className="bulletin-flow__counter" aria-live="polite">
                          {body.length}/{BULLETIN_DESCRIPTION_MAX_CHARS}
                        </span>
                      </div>
                    </label>
                  </div>
                </>
              ) : null}

              {step === "preview" ? (
                <>
                  <article className="career-hiring-flow__preview ds-surface-card">
                    <BulletinPostCard
                      variant="stack"
                      personProfileHref={`/profiles/${viewer.personId}`}
                      authorFullName={viewer.fullName}
                      departmentCode={viewer.dept}
                      batchYear={viewer.batchYear}
                      tone={bulletinUiCategoryToTone(category)}
                      categoryBadgeLabel={bulletinUiCategoryBadgeLabel(category)}
                      title={split.title}
                      summary={split.summary}
                      className="bb-post-card--compose-preview"
                    />
                  </article>
                </>
              ) : null}

              {error ? <p className="career-hiring-flow__error">{error}</p> : null}
              {publishSuccess ? (
                <p className="career-hiring-flow__success" role="status" aria-live="polite">
                  Published successfully. Sending your post to the bulletin…
                </p>
              ) : null}

              {step !== "topic" ? (
                <>
                  <footer className={`career-hiring-flow__actions${step === "preview" ? " career-hiring-flow__actions--publish" : ""}`}>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => {
                        setError(null);
                        setStep(step === "preview" ? "story" : "topic");
                      }}
                    >
                      Back
                    </Button>
                    {step === "preview" ? (
                      <Button type="button" variant="secondary" disabled={submitting} onClick={() => void publish()}>
                        {submitting ? (
                          <span className="career-hiring-flow__publish-loader">
                            <span className="career-hiring-flow__publish-loader-dot" aria-hidden />
                            Publishing…
                          </span>
                        ) : "Publish"}
                      </Button>
                    ) : (
                      <Button type="button" variant="secondary" onClick={nextStep}>
                        Review
                      </Button>
                    )}
                  </footer>
                </>
              ) : null}
            </div>

            {step !== "preview" ? (
              <aside className="career-hiring-flow__side ds-surface-card" aria-label="Preview">
                <p className="career-hiring-flow__side-title">Preview</p>
                <BulletinPostCard
                  variant="stack"
                  personProfileHref={`/profiles/${viewer.personId}`}
                  authorFullName={viewer.fullName}
                  departmentCode={viewer.dept}
                  batchYear={viewer.batchYear}
                  tone={bulletinUiCategoryToTone(category)}
                  categoryBadgeLabel={bulletinUiCategoryBadgeLabel(category)}
                  title={splitBulletinPostBody(composedContent || headline || "Headline").title || "Headline"}
                  summary={
                    splitBulletinPostBody(composedContent || headline || "Headline").summary ??
                    "Details will appear here."
                  }
                  className="career-hiring-flow__side-card bb-post-card--compose-preview"
                />
              </aside>
            ) : null}
          </div>
        </section>
      </div>
    );
  }
);

PostBulletinFlow.displayName = "PostBulletinFlow";
