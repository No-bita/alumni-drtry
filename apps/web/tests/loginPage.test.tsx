import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Login } from "../src/pages/Login";

const apiPost = vi.hoisted(() => vi.fn());
const apiGet = vi.hoisted(() => vi.fn());
vi.mock("../src/api/client", async (orig) => ({ ...(await orig<Record<string, unknown>>()), api: { post: apiPost, get: apiGet } }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ refetch: vi.fn() }) }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));
vi.mock("../src/components/LandingWorldMap", () => ({ LandingWorldMap: ({ className, showTestimonials = true }: { className?: string; showTestimonials?: boolean }) => <div data-testid="landing-map" className={className}>{showTestimonials && <div aria-label="Alumni testimonials" />}</div> }));
vi.mock("../src/components/LankaGate", () => ({ LankaGate: () => <div /> }));

beforeEach(() => {
  apiGet.mockResolvedValue({ data: { enabled: false } });
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
  vi.useRealTimers();
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

  it("acknowledges Continue immediately with an accurate pending line", async () => {
    apiPost.mockReturnValue(new Promise(() => {})); // sign-in request stays in flight
    mount();
    submit("x@itbhu.ac.in");
    // The request fires on the tap, so the pending line can say so immediately.
    expect(apiPost.mock.calls[0]?.[0]).toBe("/v1/auth/start");
    expect(apiPost.mock.calls[0]?.[1]).toEqual({ institutionalEmail: "x@itbhu.ac.in" });
    expect(screen.getByText("Sending your sign-in link…")).toBeTruthy();
    // No demo-config preflight exists anymore.
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("blocks Continue for the rate-limit countdown, then re-enables it", async () => {
    vi.useFakeTimers();
    apiPost.mockResolvedValue({
      error: { code: "AUTH_RATE_LIMITED", message: "Too many tries." },
      retryAfterSeconds: 20,
    });
    mount();
    submit("x@itbhu.ac.in");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByText("Too many tries. Try again in 1 minute.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("ignores a rapid second submit while the first is still in flight", async () => {
    let resolveStart: (v: unknown) => void = () => {};
    apiPost.mockReturnValue(new Promise((r) => { resolveStart = r; }));
    mount();
    const emailInput = screen.getByPlaceholderText("you@itbhu.ac.in");
    const form = emailInput.closest("form")!;
    fireEvent.change(emailInput, { target: { value: "x@itbhu.ac.in" } });
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    resolveStart({ data: { challengeId: "c1" } });
  });

  });

// Exercise both initial mounting and live breakpoint changes, not just CSS hiding.
describe("responsive login map", () => {
  function viewport(width: number) {
    const listeners = new Set<() => void>();
    const phoneListeners = new Set<() => void>();
    const phoneMq = {
      matches: width <= 639, media: "(max-width: 639px)",
      addEventListener: (_event: string, fn: () => void) => phoneListeners.add(fn),
      removeEventListener: (_event: string, fn: () => void) => phoneListeners.delete(fn),
    };
    const mq = {
      matches: width >= 900,
      media: "(min-width: 900px)",
      addEventListener: (_event: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_event: string, fn: () => void) => listeners.delete(fn),
    };
    window.matchMedia = ((query: string) => query === mq.media ? mq : query === phoneMq.media ? phoneMq : {
      matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
    }) as typeof window.matchMedia;
    return {
      resize(nextWidth: number) {
        act(() => {
          mq.matches = nextWidth >= 900;
          phoneMq.matches = nextWidth <= 639;
          phoneListeners.forEach((listener) => listener());
          listeners.forEach((listener) => listener());
        });
      },
      listeners, phoneListeners,
    };
  }

  it.each([640, 820, 899])("does not mount the map at %ipx", (width) => {
    viewport(width);
    mount();
    expect(screen.queryByTestId("landing-map")).toBeNull();
  });

  it.each([390, 639])("replaces the stats with the map on phones at %ipx", (width) => {
    viewport(width);
    mount();
    expect(screen.getByTestId("landing-map")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Network highlights" })).toBeNull();
    expect(screen.queryByLabelText("Alumni testimonials")).toBeNull();
  });

  it.each([900, 1440])("restores the map at %ipx", (width) => {
    viewport(width);
    mount();
    expect(screen.getByTestId("landing-map").className).toBe("auth-merged__map");
    expect(screen.getByLabelText("Alumni testimonials")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Network highlights" })).toBeTruthy();
  });

  it("mounts and unmounts when crossing the breakpoint and removes its listener", () => {
    const media = viewport(899);
    const view = mount();
    expect(screen.queryByTestId("landing-map")).toBeNull();
    media.resize(900);
    expect(screen.getByTestId("landing-map")).toBeTruthy();
    media.resize(390);
    expect(screen.getByTestId("landing-map")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Network highlights" })).toBeNull();
    expect(screen.queryByLabelText("Alumni testimonials")).toBeNull();
    media.resize(820);
    expect(screen.queryByTestId("landing-map")).toBeNull();
    expect(screen.getByRole("list", { name: "Network highlights" })).toBeTruthy();
    view.unmount();
    expect(media.listeners.size).toBe(0);
    expect(media.phoneListeners.size).toBe(0);
  });
});
