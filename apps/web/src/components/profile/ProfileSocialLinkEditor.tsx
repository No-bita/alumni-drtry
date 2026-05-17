import { useId, type FormEvent } from "react";
import { Button } from "../Button";
import { Input } from "../Input";
import {
  SOCIAL_LINK_PLACEHOLDERS,
  socialPlatformLabel,
  type SocialPlatformKey,
} from "../../lib/socialLinks";

type ProfileSocialLinkEditorProps = {
  platform: SocialPlatformKey;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  errorMessage?: string | null;
  panelId: string;
};

export function ProfileSocialLinkEditor({
  platform,
  value,
  onChange,
  onSave,
  onCancel,
  busy,
  errorMessage = null,
  panelId,
}: ProfileSocialLinkEditorProps) {
  const titleId = useId();
  const platformLabel = socialPlatformLabel(platform);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSave();
  };

  return (
    <div
      id={panelId}
      className="profile-page__social-link-editor"
      role="dialog"
      aria-labelledby={titleId}
      onClick={(event) => event.stopPropagation()}
    >
      <p id={titleId} className="profile-page__social-link-editor-title">
        {value.trim() ? "Edit" : "Add"} {platformLabel}
      </p>
      <form className="profile-page__social-link-editor-form" onSubmit={handleSubmit}>
        {errorMessage ? <p className="body-text profile-page__error-text">{errorMessage}</p> : null}
        <Input
          label={`${platformLabel} URL`}
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder={SOCIAL_LINK_PLACEHOLDERS[platform]}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
        <div className="profile-page__social-link-editor-actions">
          <Button type="submit" variant="secondary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
          <button
            type="button"
            className="profile-page__social-link-editor-cancel"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
