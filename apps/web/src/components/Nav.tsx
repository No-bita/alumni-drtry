import { useEffect, useRef } from "react";
import { useNotificationsList } from "../lib/notificationsQueries";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { canResumeOnboarding } from "../lib/onboardingEligibility";
import { useAuth } from "../contexts/AuthContext";
import { CAREER_INTENT_DEFAULT_PATH } from "../constants/careerTabs";
import { NAV_INTENT_LABELS, NAV_INTENT_SLUGS, type NavIntentSlug } from "../constants/intents";
import { isBuildIntentPageEnabled } from "../lib/buildIntentPage";
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

function BottomDockIntentIcon({ slug }: { slug: NavIntentSlug }) {
  const cls = "nav-bottom-dock__icon";
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

function IconYou({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 19.5c1-3.3 3.8-5 7-5s6 1.7 7 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconAnalytics({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 19.5h16M7 16v-5m5 5V6m5 10v-8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type NavProps = {
  right?: React.ReactNode;
  /**
   * Intent sidebar shell: left column inside the fixed top toolbar (e.g. welcome copy on `/home`).
   */
  appToolbarLead?: React.ReactNode;
  /**
   * Intent sidebar shell: toolbar search slot.
   * - Omit (`undefined`): default global quick search (`AppToolbarGlobalSearch`).
   * - Pass `null`: hide the slot entirely (e.g. alumni directory moves search into the page body).
   * - Pass a node: render it inside the toolbar search area (legacy pattern).
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
  /** Show “Finish your profile” only when `/onboarding` will accept this member. */
  canResumeOnboarding: boolean;
  onSignOut: () => void | Promise<void>;
};

function NavUserMenu({
  name,
  variant,
  profileId,
  onboardingCompleted,
  canResumeOnboarding: showResumeOnboarding,
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
    <details ref={menuRef} className={`nav__user-menu${isHome ? " nav__user-menu--home" : ""}`}>
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
            Complete Profile
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

  // Messaging paused: the badge derives from the existing notifications list with message
  // notifications excluded, so paused messages cannot leave a stuck, unclearable badge.
  // Original: const notificationsSummary = useNotificationsSummary(auth.status === "authenticated");
  //           const notificationCount = notificationsSummary.data?.count ?? 0;
  const notificationsList = useNotificationsList(auth.status === "authenticated");
  const notificationCount = (notificationsList.data?.items ?? []).filter(
    (item) => item.kind !== "connection_thread_reply"
  ).length;

  const handleSignOut = async () => {
    if (auth.status === "authenticated") {
      await auth.logout();
      navigate("/", { replace: true });
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
  const analyticsHref = myProfileId ? `/profiles/${myProfileId}#admin-analytics` : "/home";
  const analyticsActive = myProfileId != null &&
    location.pathname === `/profiles/${myProfileId}` &&
    location.hash === "#admin-analytics";

  const navClassName = isHomeNav ? "nav nav--home" : isOnboardingNav ? "nav nav--onboarding" : "nav";

  const showIntentNav =
    auth.status === "authenticated" && !hideSignOut && !hideIntentNav;

  const intentNavSlugs = NAV_INTENT_SLUGS.filter((slug) => {
    if (slug === "events") return isDevHubPagesEnabled;
    if (slug === "build") return isBuildIntentPageEnabled;
    return true;
  });

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
          canResumeOnboarding={
            auth.status === "authenticated" && auth.myProfile
              ? canResumeOnboarding(auth.myProfile, auth.person)
              : false
          }
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
            <span className="nav-app-beta-pill" title="This app is in beta" aria-label="This app is in beta">
              Beta
            </span>
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
              {isAdminUser && myProfileId ? (
                <li>
                  <Link
                    to={analyticsHref}
                    className={`nav-sidebar__link${analyticsActive ? " nav-sidebar__link--active" : ""}`.trim()}
                  >
                    <IconAnalytics className="nav-sidebar__icon" />
                    <span className="nav-sidebar__link-label">Analytics</span>
                  </Link>
                </li>
              ) : null}
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
              {appToolbarSearch !== null ? (
                <div className="nav-app-toolbar__search-wrap">
                  {appToolbarSearch === undefined ? <AppToolbarGlobalSearch /> : appToolbarSearch}
                </div>
              ) : null}
              {toolbarActionsAuthenticated}
            </div>
          ) : null}
        </header>
        <nav className="nav-bottom-dock" aria-label="Primary navigation">
          <ul className="nav-bottom-dock__list">
            <li className="nav-bottom-dock__item">
              <NavLink
                to="/home"
                end
                className={({ isActive }) =>
                  `nav-bottom-dock__link${isActive ? " nav-bottom-dock__link--active" : ""}`.trim()
                }
              >
                <IconHome className="nav-bottom-dock__icon" />
                <span className="nav-bottom-dock__label">Home</span>
              </NavLink>
            </li>
            {intentNavSlugs.map((slug) => {
              const labelClass = "nav-bottom-dock__label";
              if (slug === "career") {
                const active = intentSidebarActive("career", location.pathname);
                return (
                  <li key={slug} className="nav-bottom-dock__item">
                    <Link
                      to={CAREER_INTENT_DEFAULT_PATH}
                      className={`nav-bottom-dock__link${active ? " nav-bottom-dock__link--active" : ""}`.trim()}
                    >
                      <BottomDockIntentIcon slug="career" />
                      <span className={labelClass}>{NAV_INTENT_LABELS[slug]}</span>
                    </Link>
                  </li>
                );
              }
              if (slug === "events") {
                const active = intentSidebarActive("events", location.pathname);
                return (
                  <li key={slug} className="nav-bottom-dock__item">
                    <Link
                      to="/events"
                      className={`nav-bottom-dock__link${active ? " nav-bottom-dock__link--active" : ""}`.trim()}
                    >
                      <BottomDockIntentIcon slug="events" />
                      <span className={labelClass}>{NAV_INTENT_LABELS[slug]}</span>
                    </Link>
                  </li>
                );
              }
              return (
                <li key={slug} className="nav-bottom-dock__item">
                  <NavLink
                    to={`/intent/${slug}`}
                    className={({ isActive }) =>
                      `nav-bottom-dock__link${isActive ? " nav-bottom-dock__link--active" : ""}`.trim()
                    }
                  >
                    <BottomDockIntentIcon slug={slug} />
                    <span className={labelClass}>{NAV_INTENT_LABELS[slug]}</span>
                  </NavLink>
                </li>
              );
            })}
            {isAdminUser && myProfileId ? (
              <li className="nav-bottom-dock__item">
                <Link
                  to={analyticsHref}
                  className={`nav-bottom-dock__link${analyticsActive ? " nav-bottom-dock__link--active" : ""}`.trim()}
                >
                  <IconAnalytics className="nav-bottom-dock__icon" />
                  <span className="nav-bottom-dock__label">Analytics</span>
                </Link>
              </li>
            ) : null}
            <li className="nav-bottom-dock__item">
              {myProfileId ? (
                <NavLink
                  to={`/profiles/${myProfileId}`}
                  end
                  className={({ isActive }) =>
                    `nav-bottom-dock__link${isActive && location.hash !== "#admin-analytics" ? " nav-bottom-dock__link--active" : ""}`.trim()
                  }
                >
                  <IconYou className="nav-bottom-dock__icon" />
                  <span className="nav-bottom-dock__label">You</span>
                </NavLink>
              ) : null}
            </li>
          </ul>
        </nav>
      </>
    );
  }

  return (
    <nav className={navClassName}>
      <div className="nav__left">
        <div className="nav__brand-with-beta">
          <Link to={auth.status === "authenticated" ? "/home" : "/"} className="nav__logo">
            IIT BHU <span>Alumni</span>
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
