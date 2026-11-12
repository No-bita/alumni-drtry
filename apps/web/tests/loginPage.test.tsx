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
async function submit(email: string) {
  const input = await screen.findByPlaceholderText("you@itbhu.ac.in");
  fireEvent.change(input, { target: { value: email } });
  fireEvent.submit(input.closest("form")!);
}

describe("Login page", () => {
  it("keeps beta invite off: no invite code field", () => {
    mount();
    expect(screen.queryByPlaceholderText("Invite code")).toBeNull();
  });

  it("does nothing for a blank email", async () => {
    mount();
    await submit("   ");
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("trims and lowercases the email before starting sign-in, then shows the code cells", async () => {
    apiPost.mockResolvedValue({ data: { challengeId: "c1" } });
    mount();
    await submit("  Rahul.S@ITBHU.ac.in ");
    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(apiPost.mock.calls[0][0]).toBe("/v1/auth/start");
    expect(apiPost.mock.calls[0][1]).toEqual({ institutionalEmail: "rahul.s@itbhu.ac.in" });
    expect(await screen.findByRole("group", { name: "One-time code" })).toBeTruthy();
  });

  it("shows a spinner with neither option while the sign-in availability check runs", async () => {
    apiGet.mockReturnValue(new Promise(() => {})); // check stays in flight
    mount();
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/v1/auth/google/config"));
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Loading sign-in options…")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Continue with Google" })).toBeNull();
    expect(screen.queryByPlaceholderText("you@itbhu.ac.in")).toBeNull();
  });

  it("shows Continue with Google alongside the email form only when Google sign-in is configured", async () => {
    apiGet.mockResolvedValue({ data: { enabled: true } });
    mount();
    const google = await screen.findByRole("link", { name: "Continue with Google" });
    expect(google.getAttribute("href")).toMatch(/\/v1\/auth\/google$/);
    expect(screen.getByText("or use your email")).toBeTruthy();
    expect(screen.getByPlaceholderText("you@itbhu.ac.in")).toBeTruthy();
  });

  it("shows only the email form when Google sign-in is not configured", async () => {
    apiGet.mockResolvedValue({ data: { enabled: false } });
    mount();
    expect(await screen.findByPlaceholderText("you@itbhu.ac.in")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Continue with Google" })).toBeNull();
    expect(screen.queryByText("or use your email")).toBeNull();
    expect(screen.queryByText("Google sign-in is temporarily unavailable.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("shows a Retry Google sign-in button with the unavailable note when the availability check itself fails", async () => {
    apiGet.mockResolvedValue({ error: { code: "UNKNOWN" } }); // HTTP error shape from the api client
    mount();
    expect(await screen.findByText("Google sign-in is temporarily unavailable.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry Google sign-in" })).toBeTruthy();
    expect(screen.getByPlaceholderText("you@itbhu.ac.in")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Continue with Google" })).toBeNull();
  });

  it("shows a Retry Google sign-in button with the unavailable note when the check request itself throws", async () => {
    apiGet.mockRejectedValue(new Error("network"));
    mount();
    expect(await screen.findByText("Google sign-in is temporarily unavailable.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry Google sign-in" })).toBeTruthy();
    expect(screen.getByPlaceholderText("you@itbhu.ac.in")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Continue with Google" })).toBeNull();
  });

  it("shows a Retry Google sign-in button with the unavailable note when the availability check takes more than 10 seconds", async () => {
    apiGet.mockReturnValue(new Promise(() => {})); // check stays in flight
    vi.useFakeTimers(); // before mount, so the effect's timeout lands on fake time
    mount();
    expect(screen.getByText("Loading sign-in options…")).toBeTruthy();
    expect(screen.queryByPlaceholderText("you@itbhu.ac.in")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByPlaceholderText("you@itbhu.ac.in")).toBeTruthy();
    expect(screen.getByText("Google sign-in is temporarily unavailable.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry Google sign-in" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Continue with Google" })).toBeNull();
    expect(screen.queryByText("Loading sign-in options…")).toBeNull();
  });

  it("keeps the settled unavailable state when a slow check answers after the timeout", async () => {
    let resolveConfig: (v: { data: { enabled: boolean } }) => void = () => {};
    apiGet.mockReturnValue(new Promise((r) => { resolveConfig = r; }));
    vi.useFakeTimers(); // before mount, so the effect's timeout lands on fake time
    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByText("Google sign-in is temporarily unavailable.")).toBeTruthy();
    await act(async () => {
      resolveConfig({ data: { enabled: true } });
      await Promise.resolve();
    });
    expect(screen.getByText("Google sign-in is temporarily unavailable.")).toBeTruthy();
    expect(screen.getByPlaceholderText("you@itbhu.ac.in")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Continue with Google" })).toBeNull();
    expect(screen.getByRole("button", { name: "Retry Google sign-in" })).toBeTruthy();
  });

  it("retry shows Checking... then restores Continue with Google when the check succeeds", async () => {
    apiGet.mockRejectedValueOnce(new Error("network"));
    apiGet.mockResolvedValueOnce({ data: { enabled: true } });
    mount();
    const retry = await screen.findByRole("button", { name: "Retry Google sign-in" });
    expect(screen.queryByRole("link", { name: "Continue with Google" })).toBeNull();
    expect(apiGet).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    const checking = screen.getByRole("button", { name: "Checking..." });
    expect(checking.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Google sign-in is temporarily unavailable.")).toBeTruthy();
    expect(screen.getByPlaceholderText("you@itbhu.ac.in")).toBeTruthy();
    const google = await screen.findByRole("link", { name: "Continue with Google" });
    expect(google.getAttribute("href")).toMatch(/\/v1\/auth\/google$/);
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Google sign-in is temporarily unavailable.")).toBeNull();
  });

  it("a failed retry keeps the Retry Google sign-in button, the unavailable note and the email form", async () => {
    apiGet.mockResolvedValue({ error: { code: "UNKNOWN" } });
    mount();
    const retry = await screen.findByRole("button", { name: "Retry Google sign-in" });
    fireEvent.click(retry);
    expect(await screen.findByText("Google sign-in is temporarily unavailable.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry Google sign-in" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Continue with Google" })).toBeNull();
    expect(screen.getByPlaceholderText("you@itbhu.ac.in")).toBeTruthy();
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it("from a WhatsApp bot link: the sign-in email's link carries the WhatsApp step", async () => {
    window.localStorage.setItem("alma.waEntry", JSON.stringify({ t: "tok123456789", next: "/match?q=x", at: Date.now() }));
    apiPost.mockResolvedValue({ data: { challengeId: "c1" } });
    mount("?src=whatsapp");
    await submit("rahul.s@itbhu.ac.in");
    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(apiPost.mock.calls[0][1]).toEqual({
      institutionalEmail: "rahul.s@itbhu.ac.in",
      whatsappEntry: { token: "tok123456789", next: "/match?q=x" },
    });
    window.localStorage.clear();
  });

  it("shows the server error and stays on the form", async () => {
    apiPost.mockResolvedValue({ error: { code: "AUTH_DOMAIN_NOT_ALLOWED", message: "Use your institute email." } });
    mount();
    await submit("x@unlisted-institute.edu");
    expect(await screen.findByText("Use your institute email.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "One-time code" })).toBeNull();
  });

  it("adds a wait time, in whole minutes, to rate limit errors", async () => {
    apiPost.mockResolvedValue({
      error: { code: "AUTH_RATE_LIMITED", message: "Too many tries." },
      retryAfterSeconds: 61,
    });
    mount();
    await submit("x@itbhu.ac.in");
    expect(await screen.findByText("Too many tries. Try again in 2 minutes.")).toBeTruthy();
  });

  it("says 1 minute, singular, when the wait is under a minute", async () => {
    apiPost.mockResolvedValue({ error: { code: "AUTH_RATE_LIMITED", message: "Slow down." }, retryAfterSeconds: 20 });
    mount();
    await submit("x@itbhu.ac.in");
    expect(await screen.findByText("Slow down. Try again in 1 minute.")).toBeTruthy();
  });

  it("shows a friendly message when the request throws", async () => {
    apiPost.mockRejectedValue(new Error("network"));
    mount();
    await submit("x@itbhu.ac.in");
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeTruthy();
  });

  it("explains Google sign-in errors from the URL", async () => {
    mount("?error=google_domain");
    expect(await screen.findByText(/Sign in with a Google account that uses your institute email/)).toBeTruthy();
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
    await submit("x@itbhu.ac.in");
    // The request fires on the tap, so the pending line can say so immediately.
    expect(apiPost.mock.calls[0]?.[0]).toBe("/v1/auth/start");
    expect(apiPost.mock.calls[0]?.[1]).toEqual({ institutionalEmail: "x@itbhu.ac.in" });
    expect(screen.getByText("Sending your sign-in link…")).toBeTruthy();
    // Nothing is checked before sending: the only GET is the Google config, which doesn't block Continue.
    expect(apiGet.mock.calls.every((c) => c[0] === "/v1/auth/google/config")).toBe(true);
  });

  it("blocks Continue for the rate-limit countdown, then re-enables it", async () => {
    apiPost.mockResolvedValue({
      error: { code: "AUTH_RATE_LIMITED", message: "Too many tries." },
      retryAfterSeconds: 20,
    });
    mount();
    // Wait for the form before freezing timers: the availability check resolves on a
    // microtask, and waitFor polls on timers that fake timers would hold still.
    const emailInput = await screen.findByPlaceholderText("you@itbhu.ac.in");
    vi.useFakeTimers();
    fireEvent.change(emailInput, { target: { value: "x@itbhu.ac.in" } });
    fireEvent.submit(emailInput.closest("form")!);
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
    const emailInput = await screen.findByPlaceholderText("you@itbhu.ac.in");
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

describe("Login page: the screen matches the inbox", () => {
  const start = (extra: Record<string, unknown> = {}) => ({
    data: { challengeId: "c1", sentTo: "rahul.s@itbhu.ac.in", delivery: "sent", resendAfterSeconds: 120, ...extra },
  });

  it("names the address on a fresh send and counts down to Resend", async () => {
    apiPost.mockResolvedValue(start());
    mount();
    await submit("rahul.s@itbhu.ac.in");
    expect(await screen.findByText("We've sent you a code")).toBeTruthy();
    expect(screen.getByText(/We sent a one-time code to rahul\.s@itbhu\.ac\.in/)).toBeTruthy();
    const resend = screen.getByRole("button", { name: /Resend code in [12]:\d\d/ }) as HTMLButtonElement;
    expect(resend.disabled).toBe(true);
  });

  it("says a code was already sent when the server sent no second email", async () => {
    apiPost.mockResolvedValue(start({ delivery: "already_sent", resendAfterSeconds: 95 }));
    mount();
    await submit("rahul.s@itbhu.ac.in");
    expect(await screen.findByText("We already sent you a code")).toBeTruthy();
    expect(screen.getByText(/so we didn't send another/)).toBeTruthy();
  });

  it("says the code is on its way when delivery is unconfirmed", async () => {
    apiPost.mockResolvedValue(start({ delivery: "unconfirmed" }));
    mount();
    await submit("rahul.s@itbhu.ac.in");
    expect(await screen.findByText("Your code is on its way")).toBeTruthy();
    expect(screen.getByText(/It can take a minute to arrive/)).toBeTruthy();
  });

  it("treats an older API answer (no delivery field) as a normal send", async () => {
    apiPost.mockResolvedValue({ data: { challengeId: "c1" } });
    mount();
    await submit("rahul.s@itbhu.ac.in");
    expect(await screen.findByText("We've sent you a code")).toBeTruthy();
  });

  it("resend gets a new code, says earlier codes stop working, and verifies against the new one", async () => {
    apiPost
      .mockResolvedValueOnce(start({ resendAfterSeconds: 0 }))
      .mockResolvedValueOnce(start({ challengeId: "c2", resendAfterSeconds: 120 }))
      .mockResolvedValueOnce({ error: { code: "AUTH_CODE_SUPERSEDED", message: "That is from an earlier sign-in email. Use the code or link in the latest one." } });
    mount();
    await submit("rahul.s@itbhu.ac.in");
    fireEvent.click(await screen.findByRole("button", { name: "Resend code" }));
    expect(await screen.findByText("New code sent. Earlier codes no longer work.")).toBeTruthy();
    expect(apiPost.mock.calls[1]).toEqual(["/v1/auth/start", { institutionalEmail: "rahul.s@itbhu.ac.in" }, expect.anything()]);
    expect((screen.getByRole("button", { name: /Resend code in/ }) as HTMLButtonElement).disabled).toBe(true);

    const cells = screen.getAllByRole("textbox");
    "123456".split("").forEach((d, i) => fireEvent.change(cells[i], { target: { value: d } }));
    fireEvent.click(screen.getByRole("button", { name: "Enter code" }));
    expect(await screen.findByText(/earlier sign-in email/)).toBeTruthy();
    expect(apiPost.mock.calls[2]).toEqual(["/v1/auth/verify", { challengeId: "c2", otp: "123456" }]);
  });

  it("shows 'couldn't send' instead of silently retrying into more emails", async () => {
    apiPost.mockResolvedValue({
      error: { code: "AUTH_DELIVERY_FAILED", message: "We couldn't send the sign-in email. Try again." },
      status: 503,
    });
    mount();
    await submit("rahul.s@itbhu.ac.in");
    expect(await screen.findByText("We couldn't send the sign-in email. Try again.")).toBeTruthy();
    expect(apiPost).toHaveBeenCalledTimes(1);
  });
});


describe("Personal-provider frontend guard", () => {
  it("asks the exact question and blocks Continue without an auth request", async () => {
    mount();
    await submit("student@gmail.com");
    expect(screen.getByText("is this really your insti email id? you sure? pinky promise?")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
    expect(apiPost).not.toHaveBeenCalled();
  });
  it("lets a valid unknown institution reach the existing server check", async () => {
    apiPost.mockResolvedValue({ data: { challengeId: "c2" } });
    mount();
    await submit("student@unlisted-institute.edu");
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/auth/start", { institutionalEmail: "student@unlisted-institute.edu" }, expect.objectContaining({ signal: expect.any(AbortSignal) })));
  });
});
