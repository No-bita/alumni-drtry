import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { Landing } from "../src/pages/Landing";
import { IntentPage } from "../src/pages/IntentPage";
import { EventsPage } from "../src/pages/Events";

const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));
vi.mock("../src/components/Nav", () => ({
  Nav: ({ avatarName }: { avatarName: string }) => <nav data-testid="nav">{avatarName}</nav>,
}));
vi.mock("../src/pages/LocationPage", () => ({ LocationPage: () => <div>location lens</div> }));

afterEach(cleanup);

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname}</div>;
}

function mountAt(path: string, element: React.ReactNode, routePath = "*") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routePath} element={element} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

const authed = (over: Record<string, unknown> = {}, role = "alumni") => ({
  status: "authenticated",
  person: { personId: "p1", institutionalEmail: "rahul.s@iitbhu.ac.in", role },
  myProfile: { onboardingCompletedAt: null, appLoginCount: 1, role, fullName: null },
  myProfileError: null,
  ...over,
});

describe("Landing redirects", () => {
  it("shows loading while auth resolves", () => {
    authState.value = { status: "loading" };
    mountAt("/", <Landing />, "/");
    expect(screen.getByText("Loading…")).toBeTruthy();
  });
  it("sends signed-out users to login", () => {
    authState.value = { status: "unauthenticated" };
    mountAt("/", <Landing />, "/");
    expect(screen.getByTestId("where").textContent).toBe("/login");
  });
  it("waits for the profile instead of redirecting early", () => {
    authState.value = authed({ myProfile: null });
    mountAt("/", <Landing />, "/");
    expect(screen.getByText("Loading…")).toBeTruthy();
  });
  it("sends users with a profile error back to login", () => {
    authState.value = authed({ myProfile: null, myProfileError: new Error("x") });
    mountAt("/", <Landing />, "/");
    expect(screen.getByTestId("where").textContent).toBe("/login");
  });
  it("sends new users to onboarding, finished users to home", () => {
    authState.value = authed();
    mountAt("/", <Landing />, "/");
    expect(screen.getByTestId("where").textContent).toBe("/onboarding");
    cleanup();
    authState.value = authed({ myProfile: { fullName: "Asha Rao", departmentCode: "cse", degreeCode: "btech", batchYear: 2024, onboardingCompletedAt: "2026-01-01", appLoginCount: 1, role: "alumni" } });
    mountAt("/", <Landing />, "/");
    expect(screen.getByTestId("where").textContent).toBe("/home");
  });
  it("sends returning incomplete users to onboarding regardless of login count", () => {
    authState.value = authed({ myProfile: { onboardingCompletedAt: null, appLoginCount: 9, role: "alumni" } });
    mountAt("/", <Landing />, "/");
    expect(screen.getByTestId("where").textContent).toBe("/onboarding");
  });
});

describe("IntentPage guards", () => {
  const at = (slug: string) => mountAt(`/intent/${slug}`, <IntentPage />, "/intent/:intentSlug");
  it("redirects unknown slugs to home", () => {
    authState.value = authed();
    at("bogus");
    expect(screen.getByTestId("where").textContent).toBe("/home");
  });
  it("redirects signed-out visitors to login", () => {
    authState.value = { status: "unauthenticated" };
    at("location");
    expect(screen.getByTestId("where").textContent).toBe("/login");
  });
  it("renders the location lens for signed-in users", () => {
    authState.value = authed();
    at("location");
    expect(screen.getByText("location lens")).toBeTruthy();
  });
});

describe("EventsPage", () => {
  it("shows Coming Soon honestly, with the first name in the nav", () => {
    authState.value = authed({ myProfile: { fullName: "Asha Rao", role: "alumni" } });
    render(<MemoryRouter><EventsPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Coming Soon" })).toBeTruthy();
    expect(screen.getByTestId("nav").textContent).toBe("Asha Rao");
  });
  it("falls back to the email for the nav name, and blank when signed out", () => {
    authState.value = authed();
    render(<MemoryRouter><EventsPage /></MemoryRouter>);
    expect(screen.getByTestId("nav").textContent).toBe("Rahul");
    cleanup();
    authState.value = { status: "unauthenticated" };
    render(<MemoryRouter><EventsPage /></MemoryRouter>);
    expect(screen.getByTestId("nav").textContent).toBe("");
  });
});
