import { useRef } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { assertApiGet } from "../lib/assertApiGet";
import { queryKeys } from "../lib/queryKeys";
import type { NotificationsSummaryResponse } from "../api/client";
import { CAREER_INTENT_DEFAULT_PATH } from "../constants/careerTabs";
import { NAV_INTENT_LABELS, NAV_INTENT_SLUGS } from "../constants/intents";
import { Avatar } from "./Avatar";
import { avatarLabelFromEmail } from "../lib/emailDisplayName";

function formatNotificationBadgeCount(count: number): string {
  if (count > 99) return "99+";
  return String(count);
}

type NavProps = {
  right?: React.ReactNode;
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
  /** Hide Career / Location / Build / Explore (e.g. onboarding). */
  hideIntentNav?: boolean;
};

type NavUserMenuProps = {
  name: string;
  variant: "default" | "home";
  /** Own profile id for “My Profile”; omit if profile failed to load. */
  profileId?: string;
  /** For avatar tint when department is known. */
  departmentCode?: string | null;
  notificationCount: number;
  onSignOut: () => void | Promise<void>;
};

function NavUserMenu({
  name,
  variant,
  profileId,
  departmentCode,
  notificationCount,
  onSignOut,
}: NavUserMenuProps) {
  const isHome = variant === "home";
  const menuRef = useRef<HTMLDetailsElement>(null);

  const closeMenu = () => {
    if (menuRef.current) menuRef.current.open = false;
  };

  const badgeLabel =
    notificationCount > 0 ? `${formatNotificationBadgeCount(notificationCount)} notifications` : undefined;

  return (
    <details ref={menuRef} className={`nav__user-menu${isHome ? " nav__user-menu--home" : ""}`}>
      <summary className="nav__user-menu-summary">
        <span className="nav__user-menu-summary-inner">
          <Avatar
            name={name}
            size="sm"
            tone={isHome ? "pastel" : "default"}
            departmentCode={departmentCode}
          />
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
        <NavLink
          to="/notifications"
          className={({ isActive }) =>
            `nav__user-menu-link nav__user-menu-link--row${
              isActive ? " nav__user-menu-link--active" : ""
            }`.trim()
          }
          aria-label={badgeLabel ? `Notifications, ${notificationCount} items` : "Notifications"}
          onClick={closeMenu}
        >
          <span>Notifications</span>
          {notificationCount > 0 ? (
            <span className="nav__count-badge" aria-hidden>
              {formatNotificationBadgeCount(notificationCount)}
            </span>
          ) : null}
        </NavLink>
        {profileId ? (
          <Link
            to={`/profiles/${profileId}`}
            className="nav__user-menu-link"
            onClick={closeMenu}
          >
            My Profile
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
  extraRight,
  hideSignInLink,
  hideSignOut,
  variant = "default",
  avatarName,
  hideIntentNav = false,
}: NavProps) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isHomeNav = variant === "home" && auth.status === "authenticated";
  const isOnboardingNav = variant === "onboarding";

  const summaryQuery = useQuery({
    queryKey: queryKeys.notifications.summary(),
    queryFn: ({ signal }) => assertApiGet<NotificationsSummaryResponse>("/v1/notifications/summary", signal),
    enabled: auth.status === "authenticated" && !hideSignOut,
    staleTime: 25_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const notificationCount =
    summaryQuery.data && typeof summaryQuery.data.count === "number" ? summaryQuery.data.count : 0;

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

  const navDepartmentCode =
    auth.status === "authenticated" && auth.myProfile
      ? auth.myProfile.departmentCode ?? auth.myProfile.parsedDepartmentCode
      : null;

  const navClassName = isHomeNav ? "nav nav--home" : isOnboardingNav ? "nav nav--onboarding" : "nav";

  const showIntentNav =
    auth.status === "authenticated" && !hideSignOut && !hideIntentNav;

  return (
    <nav className={`${navClassName}${showIntentNav ? " nav--with-intents" : ""}`.trim()}>
      <div className="nav__left">
        <Link to={auth.status === "authenticated" ? "/home" : "/"} className="nav__logo">
          IIT BHU <span>Alumni</span>
        </Link>
      </div>
      {showIntentNav ? (
        <div className="nav__center" role="navigation" aria-label="What are you looking for">
          {NAV_INTENT_SLUGS.map((slug) => {
            if (slug === "career") {
              const active = location.pathname.startsWith("/intent/career");
              return (
                <Link
                  key={slug}
                  to={CAREER_INTENT_DEFAULT_PATH}
                  className={`nav__intent-link${active ? " nav__intent-link--active" : ""}`.trim()}
                >
                  {NAV_INTENT_LABELS[slug]}
                </Link>
              );
            }
            if (slug === "explore") {
              const active = location.pathname === "/search";
              return (
                <Link
                  key={slug}
                  to="/search"
                  className={`nav__intent-link${active ? " nav__intent-link--active" : ""}`.trim()}
                >
                  {NAV_INTENT_LABELS[slug]}
                </Link>
              );
            }
            return (
              <NavLink
                key={slug}
                to={`/intent/${slug}`}
                className={({ isActive }) =>
                  `nav__intent-link${isActive ? " nav__intent-link--active" : ""}`.trim()
                }
              >
                {NAV_INTENT_LABELS[slug]}
              </NavLink>
            );
          })}
        </div>
      ) : null}
      <div className="nav__right">
        {auth.status === "authenticated" ? (
          !hideSignOut ? (
            <>
              <NavUserMenu
                name={resolvedAvatarName}
                variant={variant === "home" ? "home" : "default"}
                profileId={myProfileId}
                departmentCode={navDepartmentCode}
                notificationCount={notificationCount}
                onSignOut={handleSignOut}
              />
              {extraRight}
            </>
          ) : (
            (right ?? null)
          )
        ) : hideSignInLink ? (
          (right ?? null)
        ) : (
          (right ?? (
            <Link to="/login" className="nav__guest-sign-in">
              Sign in
            </Link>
          ))
        )}
      </div>
    </nav>
  );
}
