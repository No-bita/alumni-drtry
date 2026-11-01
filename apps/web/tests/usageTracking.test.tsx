import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const apiPost = vi.hoisted(() => vi.fn());
vi.mock("../src/api/client", async (orig) => ({ ...(await orig<Record<string, unknown>>()), api: { post: apiPost } }));

import { setUsageEventSenderForTests, trackBetaUsageEvent } from "../src/lib/betaAnalytics";
import { buildInviteLink } from "../src/lib/inviteLink";
import { claimRememberedInvite, rememberInviteFromUrl } from "../src/lib/inviteAttribution";
import { HomeBrowseRow } from "../src/components/HomeBrowseRow";
import { HomeNetworkPanel } from "../src/components/HomeNetworkPanel";

const sent: Array<{ eventType: string; route: string; metadata: Record<string, unknown> }> = [];
const REF = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  sent.length = 0;
  setUsageEventSenderForTests((b) => sent.push(b));
  apiPost.mockReset();
  apiPost.mockResolvedValue({ data: {} });
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  setUsageEventSenderForTests(null);
});

describe("usage events", () => {
  it("sends only the approved events, with the page path", () => {
    trackBetaUsageEvent("home_ask_submitted");
    trackBetaUsageEvent("thread_created");
    expect(sent.map((e) => e.eventType)).toEqual(["home_ask_submitted"]);
    expect(sent[0]!.route).toBe(window.location.pathname);
  });

  it("Home browse links say which link was tapped", () => {
    render(<MemoryRouter><HomeBrowseRow /></MemoryRouter>);
    fireEvent.click(screen.getByRole("link", { name: "Careers" }));
    expect(sent).toEqual([expect.objectContaining({ eventType: "home_browse_clicked", metadata: { link: "careers" } })]);
  });

  it("invite panel: opened, copied and WhatsApp events; links carry the inviter and channel", () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<MemoryRouter><HomeNetworkPanel members={[]} directoryHref="/search" inviterPersonId={REF} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Invite batchmates" }));
    const input = screen.getByLabelText("Invite link", { selector: "input" }) as HTMLInputElement;
    expect(input.value).toBe(`${window.location.origin}/login?ref=${REF}&ch=copy`);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    const wa = screen.getByRole("link", { name: "Share on WhatsApp" }) as HTMLAnchorElement;
    expect(decodeURIComponent(wa.href)).toContain(`ref=${REF}&ch=whatsapp`);
    fireEvent.click(wa);
    expect(sent.map((e) => e.eventType)).toEqual(["invite_opened", "invite_copied", "invite_whatsapp_shared"]);
  });
});

describe("invite attribution", () => {
  it("links without an inviter stay plain", () => {
    expect(buildInviteLink("https://alma.example/")).toBe("https://alma.example/login");
  });

  it("remembers ?ref=&ch= on /login and claims it once after sign-in", async () => {
    rememberInviteFromUrl(`?ref=${REF}&ch=whatsapp`);
    await claimRememberedInvite();
    expect(apiPost).toHaveBeenCalledWith("/v1/me/invited-by", { ref: REF, channel: "whatsapp" });
    await claimRememberedInvite();
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it("ignores bad refs and stale invites", async () => {
    rememberInviteFromUrl("?ref=not-a-uuid&ch=copy");
    await claimRememberedInvite();
    rememberInviteFromUrl(`?ref=${REF}`, 0);
    await claimRememberedInvite(8 * 24 * 60 * 60 * 1000);
    expect(apiPost).not.toHaveBeenCalled();
  });
});
