import { noteLabel, type NoteDetails } from "../lib/noteForm";
import "../styles/note-card.css";

/** A note's label and fields, laid out the same in the note form preview and in Notifications. */
export function NoteBody({ details }: { details: NoteDetails }) {
  return (
    <div className="note-body">
      <span className="note-card__tag">{noteLabel(details)}</span>
      {details.purpose === "referral" ? (
        <>
          <p className="note-card__headline">
            {details.role} at {details.company}
          </p>
          <p className="note-card__text">
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
        </>
      ) : (
        <p className="note-card__text">{details.question}</p>
      )}
    </div>
  );
}
