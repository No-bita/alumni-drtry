import { useEffect, useRef, useState } from "react";
import { noteLabel, type NoteDetails } from "../lib/noteForm";
import "../styles/note-card.css";

/**
 * A note's label and fields, laid out the same in the note form preview and in Notifications.
 * clampBodyLines (recipient Notifications only): the long free-text field (question / why-fit)
 * collapses to that many lines behind a Read more toggle; short texts render without a toggle.
 */
export function NoteBody({
  details,
  clampBodyLines,
  hideTag = false,
}: {
  details: NoteDetails;
  clampBodyLines?: number;
  /** Render the body without the topic tag (the host shows it elsewhere, e.g. beside the sender name). */
  hideTag?: boolean;
}) {
  const longTextRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    if (!clampBodyLines) return;
    const el = longTextRef.current;
    if (el) setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [clampBodyLines, details]);

  const clampClass = clampBodyLines && !expanded ? "note-card__text--clamped" : undefined;
  const toggle = clampBodyLines && overflowing ? (
    <button type="button" className="note-card__readmore" onClick={() => setExpanded((v) => !v)}>
      {expanded ? "Show less" : "Read more"}
    </button>
  ) : null;

  return (
    <div className="note-body">
      {!hideTag && <span className="note-card__tag">{noteLabel(details)}</span>}
      {details.purpose === "referral" ? (
        <>
          <p className="note-card__headline">
            {details.role} at {details.company}
          </p>
          <p className={clampClass ? `note-card__text ${clampClass}` : "note-card__text"} ref={longTextRef}>
            <strong>Why I&apos;m a fit:</strong> {details.fit}
          </p>
          <p className="note-card__text">
            <strong>Job:</strong>{" "}
            <a href={details.jobUrl} target="_blank" rel="noopener noreferrer">
              {details.jobUrl}
            </a>
          </p>
          {details.resumeUrl ? (
            <p className="note-card__text">
              <strong>Résumé:</strong>{" "}
              <a href={details.resumeUrl} target="_blank" rel="noopener noreferrer">
                {details.resumeUrl}
              </a>
            </p>
          ) : null}
          {toggle}
        </>
      ) : details.purpose === "hiring" ? (
        <>
          <p className="note-card__headline">
            {details.role} at {details.company}
          </p>
          <p className={clampClass ? `note-card__text ${clampClass}` : "note-card__text"} ref={longTextRef}>
            {details.message}
          </p>
          {details.jobUrl ? (
            <p className="note-card__text">
              <strong>Job:</strong>{" "}
              <a href={details.jobUrl} target="_blank" rel="noopener noreferrer">
                {details.jobUrl}
              </a>
            </p>
          ) : null}
          {toggle}
        </>
      ) : (
        <>
          <p className={clampClass ? `note-card__text ${clampClass}` : "note-card__text"} ref={longTextRef}>
            {details.question}
          </p>
          {toggle}
        </>
      )}
    </div>
  );
}
