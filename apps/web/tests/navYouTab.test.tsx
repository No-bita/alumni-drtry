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


function renderNav() {
  return render(
    <MemoryRouter initialEntries={["/intent/location/bengaluru"]}>
      <Nav />
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

  it("keeps the desktop account menu with Sign out", () => {
    authState.value = authed();
    const { container } = renderNav();
    const menu = container.querySelector(".nav__user-menu") as HTMLElement;
    expect(menu).toBeTruthy();
    expect(within(menu).getByText("Sign out")).toBeTruthy();
  });
});
