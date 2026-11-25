/**
 * One-tap openers for an empty conversation (copy: STARTER_MESSAGES_DRAFT in lib/conversationUi.ts).
 * Tapping one puts its text in the message box to edit; it never sends by itself. Not shown yet.
 */
export function StarterMessages({
  options,
  onPick,
  disabled = false,
}: {
  options: readonly string[];
  /** Puts the text in the composer (the member edits and sends it). */
  onPick: (text: string) => void;
  disabled?: boolean;
}) {
  if (options.length === 0) return null;
  return (
    <div className="convo-starters" role="group" aria-label="Start with">
      {options.map((text) => (
        <button key={text} type="button" className="convo-starters__pill" disabled={disabled} onClick={() => onPick(text)}>
          {text.trim()}
        </button>
      ))}
    </div>
  );
}
