import { useEffect, useRef } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { CAREER_INTENT_DEFAULT_PATH } from "../constants/careerTabs";
import { NAV_INTENT_LABELS, NAV_INTENT_SLUGS, type NavIntentSlug } from "../constants/intents";
import { isDevHubPagesEnabled } from "../lib/devHubPages";
import { AppToolbarGlobalSearch } from "./AppToolbarGlobalSearch";
import { Avatar } from "./Avatar";
import { avatarLabelFromEmail } from "../lib/emailDisplayName";
import {
  IconBell,
  IconBriefcase,
  IconCity,
  IconHammer,
  IconHome,
} from "./HomeIcons";
import { IconCalendar } from "./LocationPageIcons";

function formatNotificationBadgeCount(count: number): string {
  if (count > 99) return "99+";
  return String(count);
}

function openNotificationsPanel() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("notifications:open"));
}

function intentSidebarActive(slug: NavIntentSlug, pathname: string): boolean {
  switch (slug) {
    case "career":
      return pathname.startsWith("/intent/career");
    case "location":
      return pathname.startsWith("/intent/location");
    case "build":
      return pathname.startsWith("/intent/build");
    case "events":
      return pathname === "/events";
    default: {
      const _exhaustive: never = slug;
      return _exhaustive;
    }
  }
}

function SidebarIntentIcon({ slug }: { slug: NavIntentSlug }) {
  const cls = "nav-sidebar__icon";
  switch (slug) {
    case "career":
      return <IconBriefcase className={cls} />;
    case "location":
      return <IconCity className={cls} />;
    case "build":
      return <IconHammer className={cls} />;
    case "events":
      return <IconCalendar className={cls} />;
    default: {
      const _exhaustive: never = slug;
      return _exhaustive;
    }
  }
}

type NavProps = {
  right?: React.ReactNode;
  /**
   * Intent sidebar shell: left column inside the fixed top toolbar (e.g. welcome copy on `/home`).
   */
  appToolbarLead?: React.ReactNode;
  /**
   * Intent sidebar shell: toolbar directory search (⌘K). Omit to use the default global control.
   */
  appToolbarSearch?: React.ReactNode;
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
  /** Hide Career / Location / Build / Events (e.g. onboarding). */
  hideIntentNav?: boolean;
  /** Sidebar shell: omit toolbar bottom rule (e.g. Careers page). */
  appToolbarNoBorder?: boolean;
};

type NavUserMenuProps = {
  name: string;
  variant: "default" | "home";
  /** Own profile id for “My Profile”; omit if profile failed to load. */
  profileId?: string;
  /** Hide restricted links until onboarding is complete. */
  onboardingCompleted: boolean;
  notificationCount: number;
  onSignOut: () => void | Promise<void>;
};

function NavUserMenu({
  name,
  variant,
  profileId,
  onboardingCompleted,
  notificationCount,
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

  const badgeLabel =
    notificationCount > 0 ? `${formatNotificationBadgeCount(notificationCount)} notifications` : undefined;

  return (
    <details ref={menuRef} className={`nav__user-menu${isHome ? " nav__user-menu--home" : ""}`}>
      <summary className="nav__user-menu-summary">
        <span className="nav__user-menu-summary-inner">
          <Avatar name={name} size="sm" tone={isHome ? "pastel" : "default"} />
          {notificationCount > 0 ? (
            <span className="nav__count-badge nav__count-badge--avatar" aria-hidden>
              {formatNotificationBadgeCount(notificationCount)}
            </span>
          ) : null}
        </span>
        <span className="visually-hidden">
          Account menu
          {notificationCount > 0 ? `, ${notificationCount} notifications` : ""}
        </span>
      </summary>
      <div className="nav__user-menu-panel">
        {onboardingCompleted ? (
          <>
            <button
              type="button"
              className="nav__user-menu-link nav__user-menu-link--row"
              aria-label={badgeLabel ? `Notifications, ${notificationCount} items` : "Notifications"}
              onClick={() => {
                closeMenu();
                openNotificationsPanel();
              }}
            >
              <span>Notifications</span>
              {notificationCount > 0 ? (
                <span className="nav__count-badge" aria-hidden>
                  {formatNotificationBadgeCount(notificationCount)}
                </span>
              ) : null}
            </button>
            {profileId ? (
              <Link
                to={`/profiles/${profileId}`}
                className="nav__user-menu-link nav__user-menu-link--primary"
                onClick={closeMenu}
              >
                Complete Profile
              </Link>
            ) : null}
          </>
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
  appToolbarSearch,
  extraRight,
  hideSignInLink,
  hideSignOut,
  variant = "default",
  avatarName,
  hideIntentNav = false,
  appToolbarNoBorder = false,
}: NavProps) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isHomeNav = variant === "home" && auth.status === "authenticated";
  const isOnboardingNav = variant === "onboarding";

  /** Notifications API not wired yet — no badge or summary fetch (see GlobalNotificationsWidget placeholder). */
  const notificationCount = 0;

  const handleSignOut = async () => {
    if (auth.status === "authenticated") {
      await auth.logout();
      navigate("/", { replace: true });
    }
  };

  const resolvedAvatarName =
    auth.status === "authenticated"
      ? (avatarName?.trim() || avatarLabelFromEmail(auth.person.institutionalEmail))
      : "";

  const myProfileId =
    auth.status === "authenticated" && auth.myProfile?.id ? auth.myProfile.id : undefined;
  const onboardingCompleted =
    auth.status === "authenticated" ? Boolean(auth.myProfile?.onboardingCompletedAt) : false;

  const navClassName = isHomeNav ? "nav nav--home" : isOnboardingNav ? "nav nav--onboarding" : "nav";

  const showIntentNav =
    auth.status === "authenticated" && !hideSignOut && !hideIntentNav;

  const intentNavSlugs = NAV_INTENT_SLUGS.filter(
    (slug) => isDevHubPagesEnabled || (slug !== "events" && slug !== "build")
  );

  useEffect(() => {
    if (!showIntentNav) {
      delete document.documentElement.dataset.appShell;
      return undefined;
    }
    document.documentElement.dataset.appShell = "sidebar";
    return () => {
      delete document.documentElement.dataset.appShell;
    };
  }, [showIntentNav]);

  const navUserMenuVariant = showIntentNav || variant === "home" ? "home" : "default";

  const toolbarActionsAuthenticated =
    auth.status === "authenticated" && !hideSignOut ? (
      <>
        <button
          type="button"
          className={`nav__notif-link${notificationCount > 0 ? " nav__notif-link--active" : ""}`}
          aria-label={
            notificationCount > 0
              ? `Notifications, ${formatNotificationBadgeCount(notificationCount)} unread`
              : "Notifications"
          }
          onClick={() => openNotificationsPanel()}
        >
          <IconBell className="nav__notif-icon" />
          {notificationCount > 0 ? (
            <span className="nav__count-badge nav__count-badge--nav">{formatNotificationBadgeCount(notificationCount)}</span>
          ) : null}
        </button>
        <NavUserMenu
          name={resolvedAvatarName}
          variant={navUserMenuVariant}
          profileId={myProfileId}
          onboardingCompleted={onboardingCompleted}
          notificationCount={notificationCount}
          onSignOut={handleSignOut}
        />
        {extraRight}
      </>
    ) : null;

  if (showIntentNav) {
    return (
      <>
        <aside className="nav-sidebar" aria-label="Primary navigation">
          <div className="nav-sidebar__brand">
            <Link to="/home" className="nav-sidebar__logo">
              IIT BHU <span>Alumni</span>
            </Link>
          </div>
          <nav className="nav-sidebar__nav" aria-label="What are you looking for">
            <ul className="nav-sidebar__list">
              <li>
                <NavLink
                  to="/home"
                  end
                  className={({ isActive }) =>
                    `nav-sidebar__link${isActive ? " nav-sidebar__link--active" : ""}`.trim()
                  }
                >
                  <IconHome className="nav-sidebar__icon" />
                  <span className="nav-sidebar__link-label">Home</span>
                </NavLink>
              </li>
              {intentNavSlugs.map((slug) => {
                const labelClass = "nav-sidebar__link-label";
                if (slug === "career") {
                  const active = intentSidebarActive("career", location.pathname);
                  return (
                    <li key={slug}>
                      <Link
                        to={CAREER_INTENT_DEFAULT_PATH}
                        className={`nav-sidebar__link${active ? " nav-sidebar__link--active" : ""}`.trim()}
                      >
                        <SidebarIntentIcon slug="career" />
                        <span className={labelClass}>{NAV_INTENT_LABELS[slug]}</span>
                      </Link>
                    </li>
                  );
                }
                if (slug === "events") {
                  const active = intentSidebarActive("events", location.pathname);
                  return (
                    <li key={slug}>
                      <Link
                        to="/events"
                        className={`nav-sidebar__link${active ? " nav-sidebar__link--active" : ""}`.trim()}
                      >
                        <SidebarIntentIcon slug="events" />
                        <span className={labelClass}>{NAV_INTENT_LABELS[slug]}</span>
                      </Link>
                    </li>
                  );
                }
                return (
                  <li key={slug}>
                    <NavLink
                      to={`/intent/${slug}`}
                      className={({ isActive }) =>
                        `nav-sidebar__link${isActive ? " nav-sidebar__link--active" : ""}`.trim()
                      }
                    >
                      <SidebarIntentIcon slug={slug} />
                      <span className={labelClass}>{NAV_INTENT_LABELS[slug]}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>
        <header
          className={`nav-app-toolbar${appToolbarLead ? " nav-app-toolbar--with-lead" : ""}${appToolbarNoBorder ? " nav-app-toolbar--flat" : ""}`.trim()}
        >
          {appToolbarLead ? (
            <div className="nav-app-toolbar__lead">{appToolbarLead}</div>
          ) : null}
          {toolbarActionsAuthenticated ? (
            <div className="nav-app-toolbar__right">
              <div className="nav-app-toolbar__search-wrap">
                {appToolbarSearch ?? <AppToolbarGlobalSearch />}
              </div>
              {toolbarActionsAuthenticated}
            </div>
          ) : null}
        </header>
      </>
    );
  }

  return (
    <nav className={navClassName}>
      <div className="nav__left">
        <Link to={auth.status === "authenticated" ? "/home" : "/"} className="nav__logo">
          IIT BHU <span>Alumni</span>
        </Link>
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
