import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Login } from "../src/pages/Login";

const apiPost = vi.hoisted(() => vi.fn());
const apiGet = vi.hoisted(() => vi.fn());
const authRefetch = vi.hoisted(() => vi.fn());
vi.mock("../src/api/client", async (orig) => ({ ...(await orig<Record<string, unknown>>()), api: { post: apiPost, get: apiGet } }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ refetch: authRefetch }) }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));
vi.mock("../src/components/LankaGate", () => ({ LankaGate: () => <div /> }));

beforeEach(() => {
  authRefetch.mockResolvedValue(null);
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
  const input = await screen.findByPlaceholderText("Your institute email");
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
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/v1/auth/google/config", expect.objectContaining({ signal: expect.anything(), manualRetry: false })));
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Loading sign-in options…")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Login with Google" })).toBeNull();
    expect(screen.queryByPlaceholderText("Your institute email")).toBeNull();
  });

  it("shows Login with Google alongside the email form only when Google sign-in is configured", async () => {
    apiGet.mockResolvedValue({ data: { enabled: true } });
    mount();
    const google = await screen.findByRole("link", { name: "Login with Google" });
    expect(google.getAttribute("href")).toMatch(/\/v1\/auth\/google$/);
    expect(screen.getByText("or")).toBeTruthy();
    expect(screen.getByPlaceholderText("Your institute email")).toBeTruthy();
  });

  it("shows only the email form when Google sign-in is not configured", async () => {
    apiGet.mockResolvedValue({ data: { enabled: false } });
    mount();
    expect(await screen.findByPlaceholderText("Your institute email")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Login with Google" })).toBeNull();
    expect(screen.queryByText("or")).toBeNull();
    expect(screen.queryByText("Google sign-in is temporarily unavailable.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("shows a Retry Google sign-in button with the unavailable note when the availability check itself fails", async () => {
    apiGet.mockResolvedValue({ error: { code: "UNKNOWN" } }); // HTTP error shape from the api client
    mount();
    expect(await screen.findByText("Google sign-in is temporarily unavailable.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry Google sign-in" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Your institute email")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Login with Google" })).toBeNull();
  });

  it("shows a Retry Google sign-in button with the unavailable note when the check request itself throws", async () => {
    apiGet.mockRejectedValue(new Error("network"));
    mount();
    expect(await screen.findByText("Google sign-in is temporarily unavailable.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry Google sign-in" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Your institute email")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Login with Google" })).toBeNull();
  });

  it("shows a Retry Google sign-in button with the unavailable note when the availability check takes more than 10 seconds", async () => {
    apiGet.mockReturnValue(new Promise(() => {})); // check stays in flight
    vi.useFakeTimers(); // before mount, so the effect's timeout lands on fake time
    mount();
    expect(screen.getByText("Loading sign-in options…")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Your institute email")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByPlaceholderText("Your institute email")).toBeTruthy();
    expect(screen.getByText("Google sign-in is temporarily unavailable.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry Google sign-in" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Login with Google" })).toBeNull();
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
    expect(screen.getByPlaceholderText("Your institute email")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Login with Google" })).toBeNull();
    expect(screen.getByRole("button", { name: "Retry Google sign-in" })).toBeTruthy();
  });

  it("retry shows Checking... then restores Login with Google when the check succeeds", async () => {
    apiGet.mockRejectedValueOnce(new Error("network"));
    apiGet.mockResolvedValueOnce({ data: { enabled: true } });
    mount();
    const retry = await screen.findByRole("button", { name: "Retry Google sign-in" });
    expect(screen.queryByRole("link", { name: "Login with Google" })).toBeNull();
    expect(apiGet).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    const checking = screen.getByRole("button", { name: "Checking..." });
    expect(checking.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Google sign-in is temporarily unavailable.")).toBeTruthy();
    expect(screen.getByPlaceholderText("Your institute email")).toBeTruthy();
    const google = await screen.findByRole("link", { name: "Login with Google" });
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
    expect(screen.queryByRole("link", { name: "Login with Google" })).toBeNull();
    expect(screen.getByPlaceholderText("Your institute email")).toBeTruthy();
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

  it("acknowledges Login immediately with an accurate pending line", async () => {
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

  it("blocks Login for the rate-limit countdown, then re-enables it", async () => {
    apiPost.mockResolvedValue({
      error: { code: "AUTH_RATE_LIMITED", message: "Too many tries." },
      retryAfterSeconds: 20,
    });
    mount();
    // Wait for the form before freezing timers: the availability check resolves on a
    // microtask, and waitFor polls on timers that fake timers would hold still.
    const emailInput = await screen.findByPlaceholderText("Your institute email");
    vi.useFakeTimers();
    fireEvent.change(emailInput, { target: { value: "x@itbhu.ac.in" } });
    fireEvent.submit(emailInput.closest("form")!);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByText("Too many tries. Try again in 1 minute.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Login" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect((screen.getByRole("button", { name: "Login" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("ignores a rapid second submit while the first is still in flight", async () => {
    let resolveStart: (v: unknown) => void = () => {};
    apiPost.mockReturnValue(new Promise((r) => { resolveStart = r; }));
    mount();
    const emailInput = await screen.findByPlaceholderText("Your institute email");
    const form = emailInput.closest("form")!;
    fireEvent.change(emailInput, { target: { value: "x@itbhu.ac.in" } });
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    resolveStart({ data: { challengeId: "c1" } });
  });

  });
// The map is removed from the login screen; keep the no-map result pinned at phone and desktop widths.
describe("login without the map", () => {
  function viewport(width: number) {
    const phoneMq = {
      matches: width <= 639, media: "(max-width: 639px)",
      addEventListener: () => {}, removeEventListener: () => {},
    };
    window.matchMedia = ((query: string) => query === phoneMq.media ? phoneMq : {
      matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
    }) as typeof window.matchMedia;
  }

  it.each([390, 639, 640, 900, 1440])("shows no map at %ipx", (width) => {
    viewport(width);
    mount();
    expect(screen.queryByTestId("landing-map")).toBeNull();
  });

  it("shows the four network contexts on desktop and phones", () => {
    viewport(1440);
    mount();
    expect(screen.getByRole("list", { name: "What the network covers" })).toBeTruthy();
    cleanup();
    viewport(390);
    mount();
    expect(screen.getByRole("list", { name: "What the network covers" })).toBeTruthy();
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
    expect(apiPost.mock.calls[2]).toEqual(["/v1/auth/verify", { challengeId: "c2", otp: "123456" }, { manualRetry: true }]);
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
  it("asks the exact question and blocks Login without an auth request", async () => {
    mount();
    await submit("student@gmail.com");
    expect(screen.getByText("is this really your insti email id? you sure? pinky promise?")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Login" }) as HTMLButtonElement).disabled).toBe(true);
    expect(apiPost).not.toHaveBeenCalled();
  });
  it("lets a valid unknown institution reach the existing server check", async () => {
    apiPost.mockResolvedValue({ data: { challengeId: "c2" } });
    mount();
    await submit("student@unlisted-institute.edu");
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/auth/start", { institutionalEmail: "student@unlisted-institute.edu" }, expect.objectContaining({ signal: expect.any(AbortSignal) })));
  });
});


describe("post-login without the campus intro video", () => {
 for (const completed of [false, true]) {
  it(`continues straight to ${completed ? "home" : "onboarding"} after OTP success`, async () => {
   authRefetch.mockResolvedValue({ person: { isDemo: false }, profile: { onboardingCompletedAt: completed ? "2026-11-16" : null, appLoginCount: 1 } });
   apiPost.mockResolvedValueOnce({ data: { challengeId: "c-video" } }).mockResolvedValueOnce({ data: {} });
   const view = render(<MemoryRouter initialEntries={["/login"]}><Routes><Route path="/login" element={<Login />} /><Route path="/home" element={<p>Home destination</p>} /><Route path="/onboarding" element={<p>Onboarding destination</p>} /></Routes></MemoryRouter>);
   await submit("person@iitb.ac.in");
   const cells = await screen.findAllByRole("textbox");
   "123456".split("").forEach((d, i) => fireEvent.change(cells[i], { target: { value: d } }));
   fireEvent.click(screen.getByRole("button", { name: "Enter code" }));
   expect(await screen.findByText(completed ? "Home destination" : "Onboarding destination")).toBeTruthy();
   expect(view.container.querySelector("video")).toBeNull();
   expect(authRefetch).toHaveBeenCalledTimes(1);
  });
 }
});

it("uses a campus-neutral inbox cue without changing sign-in controls", async () => {
 apiPost.mockResolvedValue({ data: { challengeId: "neutral-code" } });
 const view = mount();
 await submit("person@iitb.ac.in");
 expect(await screen.findByText("Check your inbox")).toBeTruthy();
 expect(screen.queryByText(/Lanka Bechyu/)).toBeNull();
 expect(view.container.querySelector(".auth-neutral-mail svg")).toBeTruthy();
 expect(view.container.querySelector(".lanka-gate")).toBeNull();
 expect(screen.getByRole("group", { name: "One-time code" })).toBeTruthy();
 expect(screen.getByRole("button", { name: "Enter code" })).toBeTruthy();
});
