import { useEffect, useRef, useState } from "react";
import { WhatsAppFloatingButton } from "./WhatsAppFloatingButton";
import { isShownNotification, useNotificationsList } from "../lib/notificationsQueries";
import { Link, useNavigate } from "react-router-dom";
import { canResumeOnboarding } from "../lib/onboardingEligibility";
import { useAuth } from "../contexts/AuthContext";
import { FeedbackDialog } from "./FeedbackDialog";
import { Avatar } from "./Avatar";
import { avatarLabelFromEmail } from "../lib/emailDisplayName";
import { IconBell } from "./HomeIcons";

function formatNotificationBadgeCount(count: number): string {
  if (count > 99) return "99+";
  return String(count);
}

function openNotificationsPanel(anchorRect?: DOMRect) {
  if (typeof window === "undefined") return;
  // The desktop quick view docks under the bell that opened it; the phone sheet ignores the anchor.
  const detail = anchorRect
    ? { top: anchorRect.bottom, right: window.innerWidth - anchorRect.right }
    : undefined;
  window.dispatchEvent(new CustomEvent("notifications:open", { detail }));
}

type NavProps = {
  right?: React.ReactNode;
  /** Signed-in top bar: page title shown after the logo (e.g. "Alumni directory"). */
  appToolbarLead?: React.ReactNode;
  /** Extra content after the user menu when signed in (e.g. onboarding context). */
  extraRight?: React.ReactNode;
  /** Hide the default “Sign in” link when unauthenticated (e.g. on /login). */
  hideSignInLink?: boolean;
  /** Hide “Sign out” when authenticated (e.g. on /login while starting a new session). */
  hideSignOut?: boolean;
  /** Light cream bar + dark text (signed-in home). “onboarding” = transparent bar on dark hero. */
  variant?: "default" | "home" | "onboarding";
  /** Avatar initials label; defaults to first name from institutional email. */
  avatarName?: string;
  /** Use the plain bar instead of the signed-in top bar (e.g. onboarding). */
  hideIntentNav?: boolean;
  /** Hide the toolbar notifications bell on this page. The bell stays on other pages. */
  hideNotificationsBell?: boolean;
};

type NavUserMenuProps = {
  name: string;
  variant: "default" | "home";
  /** Own profile id for “My Profile”; omit if profile failed to load. */
  profileId?: string;
  /** Hide restricted links until onboarding is complete. */
  onboardingCompleted: boolean;
  /** Show “Finish your profile” only when `/onboarding` will accept this member. */
  canResumeOnboarding: boolean;
  /** Opens the in-app feedback form; omit to hide Feedback (e.g. the plain bar). */
  onFeedback?: () => void;
  /** Admins: link to Analytics. */
  analyticsHref?: string;
  onSignOut: () => void | Promise<void>;
};

function NavUserMenu({
  name,
  variant,
  profileId,
  onboardingCompleted,
  canResumeOnboarding: showResumeOnboarding,
  onFeedback,
  analyticsHref,
  onSignOut,
}: NavUserMenuProps) {
  const isHome = variant === "home";
  const menuRef = useRef<HTMLDetailsElement>(null);

  const closeMenu = () => {
    if (menuRef.current) menuRef.current.open = false;
  };

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const menuEl = menuRef.current;
      if (!menuEl || !menuEl.open) return;
      const targetNode = event.target;
      if (!(targetNode instanceof Node)) return;
      if (!menuEl.contains(targetNode)) {
        menuEl.open = false;
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  return (
    <details
      ref={menuRef}
      className={`nav__user-menu${isHome ? " nav__user-menu--home" : ""}${profileId ? " nav__user-menu--dock-replaced" : ""}`}
    >
      <summary className="nav__user-menu-summary">
        <span className="nav__user-menu-summary-inner">
          <Avatar name={name} size="sm" tone={isHome ? "pastel" : "default"} />
        </span>
        <span className="visually-hidden">Account menu</span>
      </summary>
      <div className="nav__user-menu-panel">
        {showResumeOnboarding && profileId ? (
          <Link
            to="/onboarding"
            className="nav__user-menu-link nav__user-menu-link--primary"
            onClick={closeMenu}
          >
            Finish your profile
          </Link>
        ) : null}
        {onboardingCompleted && profileId ? (
          <Link
            to={`/profiles/${profileId}`}
            className="nav__user-menu-link nav__user-menu-link--primary"
            onClick={closeMenu}
          >
            Profile
          </Link>
        ) : null}
        {onFeedback ? (
          <button
            type="button"
            className="nav__user-menu-link"
            onClick={() => {
              closeMenu();
              onFeedback();
            }}
          >
            Feedback
          </button>
        ) : null}
        {analyticsHref ? (
          <Link to={analyticsHref} className="nav__user-menu-link" onClick={closeMenu}>
            Analytics
          </Link>
        ) : null}
        <button
          type="button"
          className="nav__user-menu-signout"
          onClick={() => {
            closeMenu();
            void onSignOut();
          }}
        >
          Sign out
        </button>
      </div>
    </details>
  );
}

export function Nav({
  right,
  appToolbarLead,
  extraRight,
  hideSignInLink,
  hideSignOut,
  variant = "default",
  avatarName,
  hideIntentNav = false,
  hideNotificationsBell = false,
}: NavProps) {
  const auth = useAuth();
  const navigate = useNavigate();
  const isHomeNav = variant === "home" && auth.status === "authenticated";
  const isOnboardingNav = variant === "onboarding";

  // Messaging paused: the badge derives from the existing notifications list with message
  // notifications excluded, so paused messages cannot leave a stuck, unclearable badge.
  // Original: const notificationsSummary = useNotificationsSummary(auth.status === "authenticated");
  //           const notificationCount = notificationsSummary.data?.count ?? 0;
  const notificationsList = useNotificationsList(auth.status === "authenticated");
  // The badge counts unseen items only; the full list (seen history) stays in the panel and inbox.
  const notificationCount = (notificationsList.data?.items ?? []).filter(
    (item) => item.unseen && isShownNotification(item)
  ).length;

  // In-app feedback form (replaced the WhatsApp feedback link).
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const handleSignOut = async () => {
    if (auth.status === "authenticated") {
      await auth.logout();
      navigate("/signed-out", { replace: true });
    }
  };

  const resolvedAvatarName =
    auth.status === "authenticated"
      ? (
          (auth.myProfile?.fullName ?? "").trim() ||
          auth.myProfile?.fullName?.trim() ||
          avatarName?.trim() ||
          avatarLabelFromEmail(auth.person.institutionalEmail)
        )
      : "";

  const myProfileId =
    auth.status === "authenticated" && auth.myProfile?.id ? auth.myProfile.id : undefined;
  const onboardingCompleted =
    auth.status === "authenticated" ? Boolean(auth.myProfile?.onboardingCompletedAt) : false;
  const isAdminUser = auth.status === "authenticated" && auth.person.role !== "alumni";

  const navClassName = isHomeNav ? "nav nav--home" : isOnboardingNav ? "nav nav--onboarding" : "nav";

  // Signed-in shell: one top bar (logo, page title, bell, account menu). No sidebar or bottom dock
  // since the Home redesign (2026-11-25): Home's tiles lead to everything else.
  const showTopBar = auth.status === "authenticated" && !hideSignOut && !hideIntentNav;

  useEffect(() => {
    if (!showTopBar) {
      delete document.documentElement.dataset.appShell;
      return undefined;
    }
    document.documentElement.dataset.appShell = "topbar";
    return () => {
      delete document.documentElement.dataset.appShell;
    };
  }, [showTopBar]);

  const navUserMenuVariant = showTopBar || variant === "home" ? "home" : "default";

  const toolbarActionsAuthenticated =
    auth.status === "authenticated" && !hideSignOut ? (
      <>
        {hideNotificationsBell ? null : (
          <button
            type="button"
            className={`nav__notif-link${notificationCount > 0 ? " nav__notif-link--active" : ""}`}
            aria-label={
              notificationCount > 0
                ? `Notifications, ${formatNotificationBadgeCount(notificationCount)} unread`
                : "Notifications"
            }
            onClick={(event) => openNotificationsPanel(event.currentTarget.getBoundingClientRect())}
          >
            <IconBell className="nav__notif-icon" />
            {notificationCount > 0 ? (
              <span className="nav__count-badge nav__count-badge--nav">{formatNotificationBadgeCount(notificationCount)}</span>
            ) : null}
          </button>
        )}
        <NavUserMenu
          name={resolvedAvatarName}
          variant={navUserMenuVariant}
          profileId={myProfileId}
          onboardingCompleted={onboardingCompleted}
          canResumeOnboarding={
            auth.status === "authenticated" && auth.myProfile
              ? canResumeOnboarding(auth.myProfile)
              : false
          }
          onFeedback={showTopBar ? () => setFeedbackOpen(true) : undefined}
          analyticsHref={showTopBar && isAdminUser && myProfileId ? "/admin/analytics" : undefined}
          onSignOut={handleSignOut}
        />
        {extraRight}
      </>
    ) : null;

  if (showTopBar) {
    return (
      <>
        <header className={`nav-app-toolbar${appToolbarLead ? " nav-app-toolbar--with-lead" : ""}`}>
          <Link to="/home" className="nav-app-toolbar__brand">
            Alma <span>Mater</span>
          </Link>
          {appToolbarLead ? <div className="nav-app-toolbar__lead">{appToolbarLead}</div> : null}
          {toolbarActionsAuthenticated ? <div className="nav-app-toolbar__right">{toolbarActionsAuthenticated}</div> : null}
        </header>
        <WhatsAppFloatingButton />
        {feedbackOpen ? <FeedbackDialog onClose={() => setFeedbackOpen(false)} /> : null}
      </>
    );
  }

  return (
    <nav className={navClassName}>
      <div className="nav__left">
        <div className="nav__brand-with-beta">
          <Link to={auth.status === "authenticated" ? "/home" : "/"} className="nav__logo">
            Alma <span>Mater</span>
          </Link>
          <span className="nav-app-beta-pill" title="This app is in beta" aria-label="This app is in beta">
            Beta
          </span>
        </div>
      </div>
      <div className="nav__right">
        {auth.status === "authenticated" ? (
          !hideSignOut ? (
            toolbarActionsAuthenticated
          ) : (
            (right ?? null)
          )
        ) : hideSignInLink ? (
          (right ?? null)
        ) : (
          (right ?? null)
        )}
      </div>
    </nav>
  );
}
