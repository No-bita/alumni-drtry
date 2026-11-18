import { FEEDBACK_WHATSAPP_URL } from "../lib/feedbackLink";

/**
 * Homepage feedback panel — opens WhatsApp in a new tab.
 */
export function HomeFeedbackSection() {
  return (
    <section className="home-feedback-panel" aria-label="Feedback">
      <p className="home-feedback-panel__prompt">How can we make this better?</p>
      <a
        className="home-feedback-panel__action"
        href={FEEDBACK_WHATSAPP_URL}
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
