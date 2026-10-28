import { useId, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { MATCH_QUESTION_MAX, MATCH_QUESTION_MIN, matchHref } from "../lib/matchApi";
import { trackBetaUsageEvent } from "../lib/betaAnalytics";
import "../styles/match.css";

const EXAMPLE_QUESTIONS = [
  "Referral at Meesho",
  "Interview prep for consulting",
  "Moving to Bengaluru next month",
] as const;

/** Home hero: plain-language question → `/match`. */
export function HomeAskBox() {
  const navigate = useNavigate();
  const inputId = useId();
  const hintId = useId();
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (text: string, how: "typed" | "example") => {
    const q = text.trim();
    if (q.length < MATCH_QUESTION_MIN) {
      setError("Write a few words about what you need.");
      return;
    }
    setError(null);
    trackBetaUsageEvent(how === "example" ? "home_example_clicked" : "home_ask_submitted");
    navigate(matchHref(q));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(question, "typed");
  };

  return (
    <form className="home-ask" onSubmit={onSubmit} role="search" aria-label="Ask alumni">
      {/* The page heading asks the question out loud; this label names the box for screen readers. */}
      <label htmlFor={inputId} className="visually-hidden">
        How can Alma Mater help you?
      </label>
      <div className="home-ask__row">
        <input
          id={inputId}
          className="home-ask__input"
          type="text"
          value={question}
          maxLength={MATCH_QUESTION_MAX}
          autoComplete="off"
          aria-describedby={hintId}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setQuestion(e.target.value);
            if (error) setError(null);
          }}
        />
        <button type="submit" className="btn btn--primary home-ask__submit">
          Find alumni
        </button>
      </div>
      {error ? (
        <p className="home-ask__error" role="alert">
          {error}
        </p>
      ) : null}
      <div id={hintId} className="home-ask__examples">
        <span className="home-ask__examples-label">Try:</span>
        {EXAMPLE_QUESTIONS.map((example) => (
          <button key={example} type="button" className="home-ask__example" onClick={() => submit(example, "example")}>
            {example}
          </button>
        ))}
      </div>
    </form>
  );
}
