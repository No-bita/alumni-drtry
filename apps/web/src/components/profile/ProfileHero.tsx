import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../Avatar";
import type { OccupationView, ProfileLinkView, PublicProfileView } from "../../api/client";
import {
  profileEducationHeadlineLine,
  residenceLine,
} from "../../lib/profileDisplay";
import type { SocialPlatformKey } from "../../lib/socialLinks";
import { MessageIcon } from "../MessageIcon";
import { ProfileHeroSocialRow } from "./ProfileHeroSocialRow";

type ProfileHeroProps = {
  loading: boolean;
  profile: PublicProfileView | null | undefined;
  occupations: OccupationView[];
  links: ProfileLinkView[];
  profileDisplayName: string;
  isOwnProfile: boolean;
  isEditing?: boolean;
  onEdit?: () => void;
  onCancelEdit?: () => void;
  onSaveEdit?: () => void;
  saving?: boolean;
  onSendMessage?: () => void;
  openSocialPlatform?: SocialPlatformKey | null;
  onOpenSocialPlatform?: (key: SocialPlatformKey) => void;
  onCloseSocialPlatform?: () => void;
  socialDraft?: Record<SocialPlatformKey, string>;
  onSocialDraftChange?: (key: SocialPlatformKey, value: string) => void;
  onSaveSocialLinks?: () => void;
  socialLinksBusy?: boolean;
  socialLinksError?: string | null;
};

function IconBack({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" aria-hidden>
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconShare({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden>
      <path d="M8 12V5.2A2.2 2.2 0 0110.2 3h8.6A2.2 2.2 0 0121 5.2v8.6a2.2 2.2 0 01-2.2 2.2H12" strokeLinecap="round" />
      <path d="M3 12h14M11 7l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconMore({ className }: { className?: string }) {
  return (
    <svg className={className} width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="6" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="18" cy="12" r="1.5" />
    </svg>
  );
}

function IconPencil({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 20h9" strokeLinecap="round" />
      <path
        d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProfileHeroMoreMenu({
  shareLabel,
  showEdit,
  onEdit,
  onShare,
}: {
  shareLabel: string;
  showEdit: boolean;
  onEdit?: () => void;
  onShare: () => void;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);

  const closeMenu = () => {
    if (menuRef.current) menuRef.current.open = false;
  };

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const menuEl = menuRef.current;
      if (!menuEl || !menuEl.open) return;
      const target = event.target;
      if (target instanceof Node && !menuEl.contains(target)) {
        menuEl.open = false;
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <details ref={menuRef} className="profile-page__hero-menu">
      <summary className="profile-page__hero-more-btn" aria-label="More options">
        <IconMore />
      </summary>
      <div className="profile-page__hero-menu-panel" role="menu">
        {showEdit && onEdit ? (
          <button
            type="button"
            role="menuitem"
            className="profile-page__hero-menu-item"
            onClick={() => {
              closeMenu();
              onEdit();
            }}
          >
            <IconPencil className="profile-page__hero-menu-item-icon" />
            Edit profile
          </button>
        ) : null}
        <button
          type="button"
          role="menuitem"
          className="profile-page__hero-menu-item"
          onClick={() => {
            closeMenu();
            void onShare();
          }}
        >
          <IconShare className="profile-page__hero-menu-item-icon" />
          {shareLabel}
        </button>
      </div>
    </details>
  );
}

export function ProfileHero({
  loading,
  profile,
  links,
  profileDisplayName,
  isOwnProfile,
  isEditing = false,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  saving = false,
  onSendMessage,
  openSocialPlatform = null,
  onOpenSocialPlatform,
  onCloseSocialPlatform,
  socialDraft,
  onSocialDraftChange,
  onSaveSocialLinks,
  socialLinksBusy = false,
  socialLinksError = null,
}: ProfileHeroProps) {
  const [shareLabel, setShareLabel] = useState("Share profile");

  const loc = residenceLine(profile?.residenceCity, profile?.residenceCountry);
  const educationLine = loading
    ? null
    : profileEducationHeadlineLine(profile, profile?.departmentCode ?? null);
  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: profileDisplayName, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareLabel("Link copied");
      window.setTimeout(() => setShareLabel("Share profile"), 2000);
    } catch {
      /* user cancelled share or clipboard denied */
    }
  };

  return (
    <header className="profile-page__header" aria-labelledby="profile-hero-heading">
      <div className="profile-page__header-toolbar">
        <Link to="/search" className="profile-page__header-back">
          <IconBack className="profile-page__header-back-icon" />
          Back to directory
        </Link>
      </div>

      <div className="profile-page__hero-card">
        <div className="profile-page__hero-avatar-col">
          <div className="profile-page__hero-avatar-wrap">
            {loading ? (
              <span className="profile-page__skeleton-line profile-page__skeleton-line--avatar" />
            ) : (
              <Avatar name={profileDisplayName} size="sm" tone="pastel" className="profile-page__hero-avatar" />
            )}
          </div>
        </div>

        <div className="profile-page__hero-body">
          <div className="profile-page__hero-name-row">
            <h1 id="profile-hero-heading" className="profile-page__hero-name">
              {loading ? <span className="profile-page__skeleton-line profile-page__skeleton-line--title" /> : profileDisplayName}
            </h1>
          </div>
          <div className="profile-portrait__identity-meta">
            {educationLine ? <p>{educationLine} · IIT BHU</p> : null}
            {loc ? <p>{loc}</p> : null}
          </div>

          {!loading ? (
            <ProfileHeroSocialRow
              links={links}
              canManageLinks={Boolean(isOwnProfile)}
              openPlatform={openSocialPlatform}
              onOpenPlatform={onOpenSocialPlatform}
              onClosePlatform={onCloseSocialPlatform}
              socialDraft={socialDraft}
              onSocialDraftChange={onSocialDraftChange}
              onSaveSocialLinks={onSaveSocialLinks}
              socialLinksBusy={socialLinksBusy}
              socialLinksError={socialLinksError}
            />
          ) : null}
        </div>

        <div
          className={`profile-page__hero-actions${
            !loading && isOwnProfile && isEditing
              ? " profile-page__hero-actions--editing"
              : !loading && isOwnProfile
                ? " profile-page__hero-actions--own"
                : ""
          }`}
        >
          {!loading && isOwnProfile && isEditing ? (
            <>
              <button
                type="button"
                className="profile-page__hero-message-btn"
                onClick={() => onSaveEdit?.()}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="profile-page__hero-cancel-btn"
                onClick={() => onCancelEdit?.()}
                disabled={saving}
              >
                Cancel
              </button>
              <ProfileHeroMoreMenu shareLabel={shareLabel} showEdit={false} onShare={handleShare} />
            </>
          ) : (
            <>
              {!loading && !isOwnProfile && onSendMessage ? (
                <button type="button" className="profile-page__hero-message-btn" onClick={onSendMessage}>
                  <MessageIcon className="profile-page__hero-message-icon" />
                  Message
                </button>
              ) : null}
              {!loading ? (
                <ProfileHeroMoreMenu
                  shareLabel={shareLabel}
                  showEdit={Boolean(isOwnProfile && onEdit && !isEditing)}
                  onEdit={onEdit}
                  onShare={handleShare}
                />
              ) : null}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
