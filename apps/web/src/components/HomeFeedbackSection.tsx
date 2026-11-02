/** Override with `VITE_FEEDBACK_FORM_URL` for your own Google Form. */
const FEEDBACK_FORM_URL_DEFAULT = "https://forms.gle/99nk9m3xu9FT5cb9A";

/**
 * Homepage feedback panel — opens the Google Form in a new tab (no backend).
 */
export function HomeFeedbackSection() {
  const rawUrl = import.meta.env.VITE_FEEDBACK_FORM_URL;
  const envUrl = typeof rawUrl === "string" ? rawUrl.trim() : "";
  const formUrl = envUrl || FEEDBACK_FORM_URL_DEFAULT;

  return (
    <section className="home-feedback-panel" aria-label="Feedback">
      <p className="home-feedback-panel__prompt">Something missing or confusing?</p>
      <a
        className="home-feedback-panel__action"
        href={formUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Give feedback — opens in a new tab"
      >
        Give feedback
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
          <path d="M7 17L17 7M7 7h10v10" />
        </svg>
      </a>
    </section>
  );
}
