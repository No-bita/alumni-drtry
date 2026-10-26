/** Override with `VITE_FEEDBACK_FORM_URL` for your own Google Form. */
const FEEDBACK_FORM_URL_DEFAULT = "https://forms.gle/99nk9m3xu9FT5cb9A";

/**
 * Homepage footer line — opens the Google Form in a new tab (no backend).
 */
export function HomeFeedbackSection() {
  const rawUrl = import.meta.env.VITE_FEEDBACK_FORM_URL;
  const envUrl = typeof rawUrl === "string" ? rawUrl.trim() : "";
  const formUrl = envUrl || FEEDBACK_FORM_URL_DEFAULT;

  return (
    <p className="home-feedback-line">
      Something missing or confusing?{" "}
      <a href={formUrl} target="_blank" rel="noopener noreferrer" aria-label="Tell us what you think — opens in a new tab">
        Tell us what you think ↗
      </a>
    </p>
  );
}
