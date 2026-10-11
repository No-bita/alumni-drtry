import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Login } from "../src/pages/Login";

const apiPost = vi.hoisted(() => vi.fn());
vi.mock("../src/api/client", async (orig) => ({ ...(await orig<Record<string, unknown>>()), api: { post: apiPost, get: vi.fn() } }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ refetch: vi.fn() }) }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));
vi.mock("../src/components/LandingWorldMap", () => ({ LandingWorldMap: () => <div /> }));
vi.mock("../src/components/LankaGate", () => ({ LankaGate: () => <div /> }));

beforeEach(() => {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as never;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mount(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/login${search}`]}>
      <Login />
    </MemoryRouter>,
  );
}
function submit(email: string) {
  fireEvent.change(screen.getByPlaceholderText("you@itbhu.ac.in"), { target: { value: email } });
  fireEvent.submit(screen.getByPlaceholderText("you@itbhu.ac.in").closest("form")!);
}

describe("Login page", () => {
  it("keeps beta invite off: no invite code field", () => {
    mount();
    expect(screen.queryByPlaceholderText("Invite code")).toBeNull();
  });

  it("does nothing for a blank email", () => {
    mount();
    submit("   ");
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("trims and lowercases the email before starting sign-in, then shows the code cells", async () => {
    apiPost.mockResolvedValue({ data: { challengeId: "c1" } });
    mount();
    submit("  Rahul.S@ITBHU.ac.in ");
    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(apiPost.mock.calls[0][0]).toBe("/v1/auth/start");
    expect(apiPost.mock.calls[0][1]).toEqual({ institutionalEmail: "rahul.s@itbhu.ac.in" });
    expect(await screen.findByRole("group", { name: "One-time code" })).toBeTruthy();
  });

  it("shows the server error and stays on the form", async () => {
    apiPost.mockResolvedValue({ error: { code: "AUTH_DOMAIN_NOT_ALLOWED", message: "Use your IIT BHU email." } });
    mount();
    submit("x@gmail.com");
    expect(await screen.findByText("Use your IIT BHU email.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "One-time code" })).toBeNull();
  });

  it("adds a wait time, in whole minutes, to rate limit errors", async () => {
    apiPost.mockResolvedValue({
      error: { code: "AUTH_RATE_LIMITED", message: "Too many tries." },
      retryAfterSeconds: 61,
    });
    mount();
    submit("x@itbhu.ac.in");
    expect(await screen.findByText("Too many tries. Try again in 2 minutes.")).toBeTruthy();
  });

  it("says 1 minute, singular, when the wait is under a minute", async () => {
    apiPost.mockResolvedValue({ error: { code: "AUTH_RATE_LIMITED", message: "Slow down." }, retryAfterSeconds: 20 });
    mount();
    submit("x@itbhu.ac.in");
    expect(await screen.findByText("Slow down. Try again in 1 minute.")).toBeTruthy();
  });

  it("shows a friendly message when the request throws", async () => {
    apiPost.mockRejectedValue(new Error("network"));
    mount();
    submit("x@itbhu.ac.in");
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeTruthy();
  });

  it("explains Google sign-in errors from the URL", async () => {
    mount("?error=google_domain");
    expect(await screen.findByText(/Sign in with a Google account that uses your IIT BHU email/)).toBeTruthy();
    cleanup();
    mount("?error=weird");
    expect(await screen.findByText("Something went wrong (weird).")).toBeTruthy();
  });

  it("explains an expired session", async () => {
    mount("?reason=session_expired");
    expect(await screen.findByText("Your session expired. Please sign in again.")).toBeTruthy();
  });
});
