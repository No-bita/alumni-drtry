import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Nav } from "../src/components/Nav";

const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/components/WhatsAppFloatingButton", () => ({ WhatsAppFloatingButton: () => null }));
vi.mock("../src/components/FeedbackDialog", () => ({ FeedbackDialog: () => <div role="dialog">Feedback form</div> }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));
vi.mock("../src/lib/notificationsQueries", () => ({
  useNotificationsList: () => ({ data: { items: [] } }),
}));

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.appShell;
});

const authed = (role = "alumni", profile: Record<string, unknown> | null = { id: "me-1", fullName: "Test Alum" }) => ({
  status: "authenticated",
  person: { personId: "p1", institutionalEmail: "test@iitbhu.ac.in", role },
  myProfile: profile ? { onboardingCompletedAt: "2026-01-01", ...profile } : null,
  logout: vi.fn(),
});

function renderNav(props: Parameters<typeof Nav>[0] = {}, entry = "/home") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Nav {...props} />
    </MemoryRouter>,
  );
}

const menuOf = (container: HTMLElement) => container.querySelector(".nav__user-menu") as HTMLElement;
const menuItems = (container: HTMLElement) =>
  [...menuOf(container).querySelectorAll(".nav__user-menu-panel a, .nav__user-menu-panel button")].map((el) => el.textContent?.trim());

describe("Signed-in top bar (no sidebar, no bottom dock)", () => {
  it("is just the logo, the bell and the account menu", () => {
    authState.value = authed();
    const { container } = renderNav();
    expect(document.documentElement.dataset.appShell).toBe("topbar");
    expect(container.querySelector(".nav-sidebar")).toBeNull();
    expect(container.querySelector(".nav-bottom-dock")).toBeNull();
    expect(container.querySelector("input")).toBeNull(); // no search box in the top bar
    const brand = container.querySelector("a.nav-app-toolbar__brand") as HTMLElement;
    expect(brand.textContent?.replace(/\s+/g, " ").trim()).toBe("Alma Mater");
    expect(brand.getAttribute("href")).toBe("/home");
    expect(container.querySelector(".nav__notif-link")).toBeTruthy();
    expect(menuOf(container)).toBeTruthy();
  });

  it("keeps the logo next to a page title", () => {
    authState.value = authed();
    const { container } = renderNav({ appToolbarLead: <h1>Alumni directory</h1> }, "/search");
    expect(container.querySelector("a.nav-app-toolbar__brand")).toBeTruthy();
    expect(within(container.querySelector(".nav-app-toolbar__lead") as HTMLElement).getByText("Alumni directory")).toBeTruthy();
  });

  it("account menu: Profile, Feedback, Sign out", () => {
    authState.value = authed();
    const { container } = renderNav();
    expect(menuItems(container)).toEqual(["Profile", "Feedback", "Sign out"]);
    expect(within(menuOf(container)).getByText("Profile").getAttribute("href")).toBe("/profiles/me-1");
  });

  it("Feedback opens the feedback form", () => {
    authState.value = authed();
    const { container, getByRole } = renderNav();
    fireEvent.click(within(menuOf(container)).getByText("Feedback"));
    expect(getByRole("dialog").textContent).toBe("Feedback form");
  });

  it("admins also get Analytics in the account menu", () => {
    authState.value = authed("admin");
    const { container } = renderNav();
    expect(menuItems(container)).toEqual(["Profile", "Feedback", "Analytics", "Sign out"]);
    expect(within(menuOf(container)).getByText("Analytics").getAttribute("href")).toBe("/admin/analytics");
  });

  it("without a loaded profile: no dead Profile link, Sign out kept", () => {
    authState.value = authed("alumni", null);
    const { container } = renderNav();
    expect(menuItems(container)).toEqual(["Feedback", "Sign out"]);
  });

  it("hides the bell when the page opts out", () => {
    authState.value = authed();
    const { container } = renderNav({ hideNotificationsBell: true });
    expect(container.querySelector(".nav__notif-link")).toBeNull();
    expect(menuOf(container)).toBeTruthy();
  });

  it("onboarding keeps the plain bar", () => {
    authState.value = authed();
    const { container } = renderNav({ hideIntentNav: true }, "/onboarding");
    expect(container.querySelector(".nav-app-toolbar")).toBeNull();
    expect(document.documentElement.dataset.appShell).toBeUndefined();
    expect(menuItems(container)).not.toContain("Feedback");
  });
});
