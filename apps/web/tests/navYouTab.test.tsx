import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Nav } from "../src/components/Nav";

const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));
vi.mock("../src/lib/notificationsQueries", () => ({
  useNotificationsList: () => ({ data: { items: [] } }),
}));
vi.mock("../src/components/AppToolbarGlobalSearch", () => ({
  AppToolbarGlobalSearch: () => <div>search</div>,
}));

afterEach(cleanup);

const authed = (role = "alumni", profile: Record<string, unknown> | null = { id: "me-1", fullName: "Test Alum" }) => ({
  status: "authenticated",
  person: { personId: "p1", institutionalEmail: "test@iitbhu.ac.in", role },
  myProfile: profile ? { onboardingCompletedAt: "2026-01-01", ...profile } : null,
  logout: vi.fn(),
});


function renderNav(props: { hideNotificationsBell?: boolean } = {}, entry = "/intent/location/bengaluru") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Nav {...props} />
    </MemoryRouter>,
  );
}

function dockLinks(container: HTMLElement) {
  const el = container.querySelector(".nav-bottom-dock__list") as HTMLElement;
  return [...el.querySelectorAll("a")].map((a) => ({
    label: a.textContent?.trim(),
    href: a.getAttribute("href"),
  }));
}

describe("bottom dock You tab", () => {
  it("links straight to the member's own profile", () => {
    authState.value = authed();
    const { container } = renderNav();
    const links = dockLinks(container);
    expect(links.map((l) => l.label)).toEqual(expect.arrayContaining(["Home", "Careers", "Cities", "You"]));
    expect(links.find((l) => l.label === "You")?.href).toBe("/profiles/me-1");
  });

  it("is hidden when the profile has not loaded (no dead link)", () => {
    authState.value = authed("alumni", null);
    const { container } = renderNav();
    expect(dockLinks(container).some((l) => l.label === "You")).toBe(false);
  });

  it("keeps Analytics for admins alongside You", () => {
    authState.value = authed("admin");
    const { container } = renderNav();
    const labels = dockLinks(container).map((l) => l.label);
    expect(labels).toContain("Analytics");
    expect(labels).toContain("You");
  });

  it("only marks the avatar menu as replaced when a profile id exists (Sign out never lost)", () => {
    authState.value = authed();
    const withProfile = renderNav().container.querySelector(".nav__user-menu") as HTMLElement;
    expect(withProfile.className).toContain("nav__user-menu--dock-replaced");
    cleanup();
    authState.value = authed("alumni", null);
    const without = renderNav().container.querySelector(".nav__user-menu") as HTMLElement;
    expect(without.className).not.toContain("nav__user-menu--dock-replaced");
    expect(within(without).getByText("Sign out")).toBeTruthy();
  });

  it("shows the notifications bell by default and hides it when the page opts out", () => {
    authState.value = authed();
    const shown = renderNav().container;
    expect(shown.querySelector(".nav__notif-link")).toBeTruthy();
    cleanup();
    const hidden = renderNav({ hideNotificationsBell: true }).container;
    expect(hidden.querySelector(".nav__notif-link")).toBeNull();
    expect(hidden.querySelector(".nav__user-menu")).toBeTruthy();
  });

  it("keeps the desktop account menu with Sign out", () => {
    authState.value = authed();
    const { container } = renderNav();
    const menu = container.querySelector(".nav__user-menu") as HTMLElement;
    expect(menu).toBeTruthy();
    expect(within(menu).getByText("Sign out")).toBeTruthy();
  });

  it("marks You as the current page only when it is the selected tab, not on Analytics", () => {
    authState.value = authed("admin");
    const own = renderNav({}, "/profiles/me-1");
    const dock = (c: HTMLElement) => c.querySelector(".nav-bottom-dock__list") as HTMLElement;
    const you = (c: HTMLElement) => within(dock(c)).getByText("You").closest("a") as HTMLElement;
    expect(you(own.container).getAttribute("aria-current")).toBe("page");
    expect(you(own.container).className).toContain("nav-bottom-dock__link--active");
    cleanup();
    const analytics = renderNav({}, "/admin/analytics");
    expect(you(analytics.container).getAttribute("aria-current")).toBeNull();
    expect(you(analytics.container).className).not.toContain("nav-bottom-dock__link--active");
    const analyticsLink = within(dock(analytics.container)).getByText("Analytics").closest("a") as HTMLElement;
    expect(analyticsLink.className).toContain("nav-bottom-dock__link--active");
    expect(analyticsLink.getAttribute("href")).toBe("/admin/analytics");
  });
});
