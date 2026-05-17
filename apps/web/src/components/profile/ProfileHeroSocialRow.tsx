import { useEffect, useId, useRef } from "react";
import type { ProfileLinkView } from "../../api/client";
import {
  linkToSocialPlatformKey,
  SOCIAL_PLATFORM_ORDER,
  socialLinksByPlatform,
  socialPlatformLabel,
  type SocialPlatformKey,
} from "../../lib/socialLinks";
import { ProfileSocialLinkEditor } from "./ProfileSocialLinkEditor";

function IconExternal({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M7 17L17 7M17 7H9M17 7v8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SocialPlatformIcon({ platform }: { platform: SocialPlatformKey }) {
  const className = "profile-page__hero-social-icon";
  if (platform === "linkedin") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 110-4.12 2.06 2.06 0 010 4.12zM7.12 20.45H3.56V9h3.56v11.45z" />
      </svg>
    );
  }
  if (platform === "github") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.7-2.78.62-3.37-1.36-3.37-1.36-.45-1.18-1.12-1.5-1.12-1.5-.92-.64.07-.63.07-.63 1.02.07 1.55 1.06 1.55 1.06.9 1.56 2.36 1.11 2.94.85.09-.67.35-1.11.64-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.32.1-2.74 0 0 .84-.27 2.75 1.03A9.2 9.2 0 0112 6.84c1.68.01 3.37.23 4.95.68 1.9-1.3 2.74-1.03 2.74-1.03.55 1.42.2 2.48.1 2.74.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.03 10.03 0 0022 12.26C22 6.58 17.52 2 12 2z" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.24 3H21.5l-7.5 8.57L22.5 21h-6.55l-5.13-6.71L4.74 21H1.47l8.02-9.17L1.5 3h6.72l4.64 6.13L18.24 3zm-2.3 16.2h1.72L7.12 4.74H5.28l10.66 14.46z" />
    </svg>
  );
}

type ProfileHeroSocialRowProps = {
  links: ProfileLinkView[];
  canManageLinks: boolean;
  openPlatform?: SocialPlatformKey | null;
  onOpenPlatform?: (key: SocialPlatformKey) => void;
  onClosePlatform?: () => void;
  socialDraft?: Record<SocialPlatformKey, string>;
  onSocialDraftChange?: (key: SocialPlatformKey, value: string) => void;
  onSaveSocialLinks?: () => void;
  socialLinksBusy?: boolean;
  socialLinksError?: string | null;
};

export function ProfileHeroSocialRow({
  links,
  canManageLinks,
  openPlatform = null,
  onOpenPlatform,
  onClosePlatform,
  socialDraft,
  onSocialDraftChange,
  onSaveSocialLinks,
  socialLinksBusy = false,
  socialLinksError = null,
}: ProfileHeroSocialRowProps) {
  const rowRef = useRef<HTMLUListElement>(null);
  const panelIdPrefix = useId();
  const byKey = socialLinksByPlatform(links);
  const otherLinks = links.filter((link) => !linkToSocialPlatformKey(link));

  const showCanonicalRow =
    canManageLinks || SOCIAL_PLATFORM_ORDER.some((key) => byKey.has(key)) || otherLinks.length > 0;

  useEffect(() => {
    if (!openPlatform) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClosePlatform?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openPlatform, onClosePlatform]);

  useEffect(() => {
    if (!openPlatform) return;

    const onPointerDown = (event: PointerEvent) => {
      const rowEl = rowRef.current;
      if (!rowEl) return;
      const target = event.target;
      if (target instanceof Node && !rowEl.contains(target)) {
        onClosePlatform?.();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openPlatform, onClosePlatform]);

  if (!showCanonicalRow) return null;

  return (
    <ul ref={rowRef} className="profile-page__hero-social">
      {SOCIAL_PLATFORM_ORDER.map((key) => {
        const link = byKey.get(key);
        const label = socialPlatformLabel(key);
        const panelId = `${panelIdPrefix}-${key}`;
        const isOpen = canManageLinks && openPlatform === key;

        if (canManageLinks && !link) {
          return (
            <li
              key={key}
              className={`profile-page__hero-social-item${isOpen ? " profile-page__hero-social-item--open" : ""}`}
            >
              <button
                type="button"
                className="profile-page__hero-social-link profile-page__hero-social-link--manage"
                aria-expanded={isOpen}
                aria-controls={isOpen ? panelId : undefined}
                onClick={() => (isOpen ? onClosePlatform?.() : onOpenPlatform?.(key))}
              >
                <SocialPlatformIcon platform={key} />
                <span className="profile-page__hero-social-action-label">Add</span>
                <span className="profile-page__hero-social-action-platform">{label}</span>
              </button>
              {isOpen && socialDraft && onSocialDraftChange && onSaveSocialLinks && onClosePlatform ? (
                <ProfileSocialLinkEditor
                  platform={key}
                  panelId={panelId}
                  value={socialDraft[key]}
                  onChange={(value) => onSocialDraftChange(key, value)}
                  onSave={onSaveSocialLinks}
                  onCancel={onClosePlatform}
                  busy={socialLinksBusy}
                  errorMessage={socialLinksError}
                />
              ) : null}
            </li>
          );
        }

        if (canManageLinks && link) {
          return (
            <li
              key={link.id}
              className={`profile-page__hero-social-item${isOpen ? " profile-page__hero-social-item--open" : ""}`}
            >
              <button
                type="button"
                className="profile-page__hero-social-link profile-page__hero-social-link--manage"
                aria-expanded={isOpen}
                aria-controls={isOpen ? panelId : undefined}
                onClick={() => (isOpen ? onClosePlatform?.() : onOpenPlatform?.(key))}
              >
                <SocialPlatformIcon platform={key} />
                <span className="profile-page__hero-social-action-label">Edit</span>
                <span className="profile-page__hero-social-action-platform">{label}</span>
              </button>
              {isOpen && socialDraft && onSocialDraftChange && onSaveSocialLinks && onClosePlatform ? (
                <ProfileSocialLinkEditor
                  platform={key}
                  panelId={panelId}
                  value={socialDraft[key]}
                  onChange={(value) => onSocialDraftChange(key, value)}
                  onSave={onSaveSocialLinks}
                  onCancel={onClosePlatform}
                  busy={socialLinksBusy}
                  errorMessage={socialLinksError}
                />
              ) : null}
            </li>
          );
        }

        if (!link) return null;

        return (
          <li key={link.id}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="profile-page__hero-social-link"
            >
              <SocialPlatformIcon platform={key} />
              <span>{label}</span>
              <IconExternal className="profile-page__hero-social-external" />
            </a>
          </li>
        );
      })}
      {!canManageLinks
        ? otherLinks.map((link) => (
            <li key={link.id}>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="profile-page__hero-social-link"
              >
                <span>{link.platform}</span>
                <IconExternal className="profile-page__hero-social-external" />
              </a>
            </li>
          ))
        : null}
    </ul>
  );
}
