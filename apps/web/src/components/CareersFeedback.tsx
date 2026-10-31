import type { ReactNode } from "react";
import "./CareersFeedback.css";

/** Existing Careers feedback only. Tone never infers a new application state. */
export function CareersFeedback({ tone, children }: { tone: "success" | "error"; children: ReactNode }) {
  return (
    <div className={`careers-feedback careers-feedback--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span className="careers-feedback__icon" aria-hidden="true">{tone === "success" ? "✓" : "!"}</span>
      <div className="careers-feedback__content">{children}</div>
    </div>
  );
}
