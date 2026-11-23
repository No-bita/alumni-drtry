import { useState } from "react";
import { api, type ProfileLinkView } from "../../api/client";
import { preflightProfileEdits } from "../../lib/profileSavePreflight";
import {
  SOCIAL_LINK_PLACEHOLDERS,
  SOCIAL_PLATFORM_ORDER,
  linkToSocialPlatformKey,
  normalizeSocialUrl,
  otherProfileLinks,
  socialLinksDraftFromProfile,
  socialPlatformLabel,
  type SocialPlatformKey,
} from "../../lib/socialLinks";
import { displayLinkText } from "../../lib/profilePage";
import { FormField } from "../forms";
import { ProfileSheet } from "./ProfileSheet";

type Props = {
  /** The owner's own links (from /v1/me/links). */
  links: ProfileLinkView[];
  onClose: () => void;
  onSaved: () => void;
  /** A save failed part-way: reload what's stored without closing, so the member can retry. */
  onPartialSave: () => void;
};

/**
 * LinkedIn, GitHub and X, plus removing any other link saved earlier. If a save fails, the sheet
 * stays open with the error and everything the member typed; retrying compares against what's stored.
 */
export function LinksSheet({ links, onClose, onSaved, onPartialSave }: Props) {
  const [draft, setDraft] = useState<Record<SocialPlatformKey, string>>(() => socialLinksDraftFromProfile(links));
  const [others, setOthers] = useState<ProfileLinkView[]>(() => otherProfileLinks(links));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const problem = preflightProfileEdits([], draft);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    const existing = new Map<SocialPlatformKey, ProfileLinkView>();
    for (const link of links) {
      const key = linkToSocialPlatformKey(link);
      if (key && !existing.has(key)) existing.set(key, link);
    }
    const removedOthers = otherProfileLinks(links).filter((l) => !others.some((o) => o.id === l.id));
    try {
      for (const key of SOCIAL_PLATFORM_ORDER) {
        const normalized = normalizeSocialUrl(draft[key]);
        const current = existing.get(key);
        const platform = socialPlatformLabel(key);
        if (!normalized) {
          if (current) await must(api.delete(`/v1/me/links/${current.id}`));
          continue;
        }
        if (current) {
          if (current.url !== normalized) {
            await must(api.patch(`/v1/me/links/${current.id}`, { platform, url: normalized, label: null }));
          }
        } else {
          await must(api.post("/v1/me/links", { platform, url: normalized, label: null }));
        }
      }
      for (const link of removedOthers) await must(api.delete(`/v1/me/links/${link.id}`));
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? `Couldn't save your links. ${err.message}` : "Couldn't save your links. Try again.");
      onPartialSave(); // some links may have saved before the failure
      return;
    }
    setSaving(false);
    onSaved();
  };

  return (
    <ProfileSheet title="Links" onClose={onClose} onSave={save} saving={saving} error={error}>
      {SOCIAL_PLATFORM_ORDER.map((key) => (
        <FormField key={key} label={key === "twitter" ? "X (Twitter)" : socialPlatformLabel(key)}>
          <input
            className="input"
            inputMode="url"
            autoComplete="url"
            placeholder={SOCIAL_LINK_PLACEHOLDERS[key]}
            value={draft[key]}
            onChange={(e) => {
              setDraft((prev) => ({ ...prev, [key]: e.target.value }));
              setError(null);
            }}
          />
        </FormField>
      ))}
      {others.length > 0 ? (
        <div className="pp-links-edit__others">
          <p className="pp-links-edit__label">Other links</p>
          <ul className="pp-entries__list">
            {others.map((link) => (
              <li key={link.id} className="pp-entries__item">
                <div className="pp-entries__item-copy">
                  <strong>{link.label || link.platform}</strong>
                  <span>{displayLinkText(link.url)}</span>
                </div>
                <button
                  type="button"
                  className="pp-inline-link"
                  aria-label={`Remove ${link.label || link.platform}`}
                  onClick={() => setOthers((prev) => prev.filter((o) => o.id !== link.id))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </ProfileSheet>
  );
}

async function must(res: Promise<{ error?: { code: string; message?: string } }>): Promise<void> {
  const { error } = await res;
  if (error) throw new Error(error.message ?? error.code);
}
