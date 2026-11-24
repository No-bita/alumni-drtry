import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Nav } from "../src/components/Nav";

const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/components/WhatsAppFloatingButton", () => ({ WhatsAppFloatingButton: () => null }));
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

function youLink(container: HTMLElement) {
  return container.querySelector("a.nav__you-direct");
}

describe("You in the top bar (phone), not the dock", () => {
  it("the bottom dock has no You tab", () => {
    authState.value = authed();
    const { container } = renderNav();
    const labels = dockLinks(container).map((l) => l.label);
    expect(labels).toEqual(expect.arrayContaining(["Home", "Careers", "Cities"]));
    expect(labels).not.toContain("You");
  });

  it("the avatar links straight to the member's own profile", () => {
    authState.value = authed();
    const { container } = renderNav();
    const link = youLink(container) as HTMLElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/profiles/me-1");
  });

  it("falls back to the account menu when the profile has not loaded (no dead link, Sign out kept)", () => {
    authState.value = authed("alumni", null);
    const { container } = renderNav();
    expect(youLink(container)).toBeNull();
    expect(dockLinks(container).some((l) => l.label === "You")).toBe(false);
    const menu = container.querySelector(".nav__user-menu") as HTMLElement;
    expect(menu).toBeTruthy();
    expect(within(menu).getByText("Sign out")).toBeTruthy();
  });

  it("keeps Analytics for admins in the dock, avatar still opens the profile", () => {
    authState.value = authed("admin");
    const { container } = renderNav();
    const labels = dockLinks(container).map((l) => l.label);
    expect(labels).toContain("Analytics");
    expect(labels).not.toContain("You");
    expect(youLink(container)?.getAttribute("href")).toBe("/profiles/me-1");
  });

  it("keeps the desktop account menu with Sign out (hidden on phone by CSS only)", () => {
    authState.value = authed();
    const { container } = renderNav();
    const menu = container.querySelector(".nav__user-menu") as HTMLElement;
    expect(menu).toBeTruthy();
    expect(within(menu).getByText("Sign out")).toBeTruthy();
    expect(menu.closest(".nav__you-menu-slot")).toBeTruthy();
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

  it("marks the avatar as current page only on the member's own profile, not on Analytics", () => {
    authState.value = authed("admin");
    const own = renderNav({}, "/profiles/me-1");
    const ownLink = youLink(own.container) as HTMLElement;
    expect(ownLink.getAttribute("aria-current")).toBe("page");
    expect(ownLink.className).toContain("nav__you-direct--active");
    cleanup();
    const analytics = renderNav({}, "/admin/analytics");
    const analyticsLink = youLink(analytics.container) as HTMLElement;
    expect(analyticsLink.getAttribute("aria-current")).toBeNull();
    expect(analyticsLink.className).not.toContain("nav__you-direct--active");
  });
});

describe("phone top bar wordmark", () => {
  it("shows the Alma Mater wordmark linking home when the page has no toolbar lead", () => {
    authState.value = authed();
    const { container } = renderNav();
    const brand = container.querySelector("a.nav-app-toolbar__brand") as HTMLElement;
    expect(brand).toBeTruthy();
    expect(brand.textContent?.replace(/\s+/g, " ").trim()).toBe("Alma Mater");
    expect(brand.getAttribute("href")).toBe("/home");
  });
});
