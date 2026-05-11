/** Override with `VITE_FEEDBACK_FORM_URL` for your own Google Form. */
const FEEDBACK_FORM_URL_DEFAULT = "https://forms.gle/99nk9m3xu9FT5cb9A";

/**
 * Homepage footer — opens the Google Form in a new tab (no backend).
 */
export function HomeFeedbackSection() {
  const rawUrl = import.meta.env.VITE_FEEDBACK_FORM_URL;
  const envUrl = typeof rawUrl === "string" ? rawUrl.trim() : "";
  const formUrl = envUrl || FEEDBACK_FORM_URL_DEFAULT;

  return (
    <section className="home-feedback" aria-labelledby="home-feedback-heading">
      <div className="home-feedback__card">
        <div className="home-feedback__inner">
          <h2 id="home-feedback-heading" className="home-feedback__title">
            Tell us what you think
          </h2>
          <div className="home-feedback__cta-row">
            <a
              className="home-feedback__cta"
              href={formUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Share feedback — opens in a new tab"
            >
              Share Feedback
              <span className="home-feedback__cta-suffix" aria-hidden>
                ↗
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
