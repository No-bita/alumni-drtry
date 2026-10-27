import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiPost = vi.hoisted(() => vi.fn());
const apiPatch = vi.hoisted(() => vi.fn());
const apiGet = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/api/client", async (orig) => ({ ...(await orig<Record<string, unknown>>()), api: { post: apiPost, patch: apiPatch } }));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: apiGet }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));

import { WhatsAppEntryPage } from "../src/pages/WhatsAppEntryPage";
import { WhatsAppNotesSettings } from "../src/components/WhatsAppNotesSettings";
import { pendingWhatsAppEntry, rememberWhatsAppEntry, safeNext, sharedContactHref } from "../src/lib/whatsapp";

const settings = { linked: true, numberHint: "3210", notesOptedIn: false, notesPaused: false, stopped: false, botNumber: "919999999999" };

function Where() {
  const l = useLocation();
  return <p data-testid="where">{`${l.pathname}${l.search}`}</p>;
}

function mountAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/wa" element={<WhatsAppEntryPage />} />
          <Route path="/w/:code" element={<WhatsAppEntryPage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const member = (onboarded = true) => ({
  status: "authenticated",
  person: { personId: "p1", role: "alumni", isDemo: false },
  myProfile: { onboardingCompletedAt: onboarded ? "2026-01-01" : null, appLoginCount: 1 },
});

/** POST /check answers with this status; POST /whatsapp-link links. */
function answerCheck(status: string, next: string | null = null) {
  apiPost.mockImplementation(async (url: string) =>
    url === "/v1/me/whatsapp-link/check" ? { data: { link: { status, numberHint: "3210", next } } } : { data: { whatsapp: settings } },
  );
}
const claimed = () => apiPost.mock.calls.some((c) => c[0] === "/v1/me/whatsapp-link");
const confirmLink = async () => {
  expect(await screen.findByRole("heading", { name: "Link WhatsApp ending 3210 to your account?" })).toBeTruthy();
  expect(claimed()).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Yes, link it" }));
};

beforeEach(() => {
  window.localStorage.clear();
  apiPost.mockReset();
  apiPatch.mockReset();
  apiGet.mockReset();
  answerCheck("ready");
  apiGet.mockResolvedValue({ whatsapp: settings });
});
afterEach(cleanup);

describe("WhatsApp entry links (/wa)", () => {
  it("signed out: remembers the link and goes to sign-in", async () => {
    authState.value = { status: "unauthenticated" };
    mountAt("/wa?t=tok123456789&next=%2Fmatch%3Fq%3Dx");
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/login?src=whatsapp"));
    expect(pendingWhatsAppEntry()).toMatchObject({ t: "tok123456789", next: "/match?q=x" });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("signed in: asks first (last 4 digits), links on yes, then follows the link's destination", async () => {
    authState.value = member();
    mountAt("/wa?t=tok123456789&next=%2Fmatch%3Fq%3Dx%26reach%3Da1%26via%3Dwhatsapp");
    await confirmLink();
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/match?q=x&reach=a1&via=whatsapp"));
    expect(apiPost).toHaveBeenCalledWith("/v1/me/whatsapp-link", { token: "tok123456789" });
    expect(pendingWhatsAppEntry()).toBeNull();
  });

  it("short link /w/<code>: same steps with the code; the destination comes from the server", async () => {
    answerCheck("ready", "/match?q=x&reach=a1&via=whatsapp");
    authState.value = member();
    mountAt("/w/k3x9Qa7Z");
    await confirmLink();
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/match?q=x&reach=a1&via=whatsapp"));
    expect(apiPost).toHaveBeenCalledWith("/v1/me/whatsapp-link/check", { token: "k3x9Qa7Z" });
    expect(apiPost).toHaveBeenCalledWith("/v1/me/whatsapp-link", { token: "k3x9Qa7Z" });
  });

  it("short link, signed out: remembers the code for after sign-in", async () => {
    authState.value = { status: "unauthenticated" };
    mountAt("/w/k3x9Qa7Z");
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/login?src=whatsapp"));
    expect(pendingWhatsAppEntry()).toMatchObject({ t: "k3x9Qa7Z", next: null });
  });

  it("a destination from the server is only followed when it's on our site", async () => {
    answerCheck("already_yours", "https://evil.example");
    authState.value = member();
    mountAt("/w/k3x9Qa7Z");
    expect(await screen.findByRole("heading", { name: "WhatsApp linked" })).toBeTruthy();
  });

  it("their own number already: no question, straight to the destination", async () => {
    answerCheck("already_yours");
    authState.value = member();
    mountAt("/wa?t=tok123456789&next=%2Fmatch%3Fq%3Dx");
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/match?q=x"));
    expect(claimed()).toBe(false);
  });

  it("new members go to onboarding after linking", async () => {
    authState.value = member(false);
    mountAt("/wa?t=tok123456789");
    await confirmLink();
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/onboarding"));
  });

  it("returning from sign-in (no params) uses the remembered link; with no destination shows the linked screen", async () => {
    rememberWhatsAppEntry("tok123456789", null);
    authState.value = member();
    mountAt("/wa");
    await confirmLink();
    expect(await screen.findByRole("heading", { name: "WhatsApp linked" })).toBeTruthy();
    expect(await screen.findByText("Get referral asks on WhatsApp")).toBeTruthy();
  });

  it("'Not me' links nothing and forgets the link", async () => {
    authState.value = member();
    mountAt("/wa?t=tok123456789");
    expect(await screen.findByRole("heading", { name: "Link WhatsApp ending 3210 to your account?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Not me" }));
    expect(await screen.findByRole("heading", { name: "Nothing was linked" })).toBeTruthy();
    expect(claimed()).toBe(false);
    expect(pendingWhatsAppEntry()).toBeNull();
  });

  it("a link sent to someone else's WhatsApp can't link anything", async () => {
    answerCheck("linked_elsewhere");
    authState.value = member();
    mountAt("/wa?t=tok123456789&next=%2Fmatch%3Fq%3Dx");
    expect((await screen.findByRole("alert")).textContent).toContain("another member's WhatsApp");
    expect(claimed()).toBe(false);
  });

  it("an expired link explains what to do", async () => {
    apiPost.mockResolvedValue({ error: { code: "WHATSAPP_LINK_INVALID", message: "This WhatsApp link has expired. Text hi to the bot for a new one." } });
    authState.value = member();
    mountAt("/wa?t=tok123456789");
    expect((await screen.findByRole("alert")).textContent).toContain("expired");
  });

  it("shared contacts: a WhatsApp number opens a chat, an email opens mail", () => {
    expect(sharedContactHref("+919876543210")).toEqual({ href: "https://wa.me/919876543210", isWhatsApp: true });
    expect(sharedContactHref("arun@gmail.com")).toEqual({ href: "mailto:arun@gmail.com", isWhatsApp: false });
  });

  it("only same-site destinations are followed", () => {
    expect(safeNext("/match?q=1")).toBe("/match?q=1");
    expect(safeNext("//evil.example")).toBeNull();
    expect(safeNext("https://evil.example")).toBeNull();
    expect(safeNext("/\\evil")).toBeNull();
  });
});

describe("WhatsApp notes settings", () => {
  function mountSettings(variant?: "inline") {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <WhatsAppNotesSettings variant={variant} />
      </QueryClientProvider>,
    );
  }

  it("opting in saves and then offers pause", async () => {
    apiPatch.mockResolvedValue({ data: { whatsapp: { ...settings, notesOptedIn: true } } });
    mountSettings();
    fireEvent.click(await screen.findByLabelText("Get referral asks on WhatsApp"));
    await waitFor(() => expect(apiPatch).toHaveBeenCalledWith("/v1/me/whatsapp", { notesOptedIn: true }));
    expect(await screen.findByLabelText("Pause for now (they'll come by email)")).toBeTruthy();
  });

  it("not linked: points to the bot; inline variant stays hidden", async () => {
    apiGet.mockResolvedValue({ whatsapp: { ...settings, linked: false, numberHint: null } });
    const { container } = mountSettings("inline");
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(container.textContent).toBe("");
    cleanup();
    mountSettings();
    expect((await screen.findByRole("link", { name: "Open WhatsApp" })).getAttribute("href")).toBe("https://wa.me/919999999999");
  });
});
