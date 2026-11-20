/** The existing global save/cancel transaction, within the persistent editor toolbar. */
export function ProfileEditorActions({ saving, onSave }: {
  saving: boolean; onSave?: () => void;
}) {
  return <div className="profile-editor__actions" aria-label="Profile edit actions">
    <button type="button" className="profile-page__hero-message-btn" disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save"}</button>
  </div>;
}
