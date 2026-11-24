import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { IntentcastFeedItem } from "../src/api/client";

const getMock = vi.hoisted(() => vi.fn());
const postMock = vi.hoisted(() => vi.fn());
const assertGet = vi.hoisted(() => vi.fn());
const putMock = vi.hoisted(() => vi.fn());
vi.mock("../src/api/client", () => ({ api: { get: getMock, post: postMock, put: putMock } }));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: assertGet }));
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({
    status: "authenticated",
    person: { personId: "me", institutionalEmail: "me@iitbhu.ac.in" },
    myProfile: { fullName: "Sample Alum", departmentCode: "CSE", batchYear: 2020, residenceCity: "Bengaluru" },
  }),
}));

import { closesInLabel, progressStages, type BrokerAsk, type BrokerRequest } from "../src/lib/broker";
import { experienceBandForBatchYear, hiringHeaderLine } from "../src/lib/jobFunctions";
import { mapIntentcastToRow } from "../src/lib/careerFeedRow";
import { setupSteps } from "../src/lib/profilePage";
import { ReferralRequestFlow } from "../src/components/broker/ReferralRequestFlow";
import { BrokerAsksSection, BrokerRequestsSection } from "../src/components/broker/BrokerSections";
import { PostBulletinFlow, type PostBulletinFlowHandle } from "../src/components/PostBulletinFlow";
import { BrokerWhatsAppSetting } from "../src/components/broker/BrokerWhatsAppSetting";

const request = (over: Partial<BrokerRequest> = {}): BrokerRequest => ({
  id: "r1",
  kind: "referral",
  company: "Swiggy",
  jobFunction: "product",
  experienceBand: "3_7",
  roleTitle: "Product Manager",
  jobUrl: "https://jobs.example.com/pm",
  status: "open",
  askedCount: 6,
  seenCount: 0,
  createdAt: "2026-11-24T10:00:00Z",
  expiresAt: new Date(Date.now() + 47 * 3_600_000).toISOString(),
  firstSeenAt: null,
  connectedAt: null,
  expiredAt: null,
  intentcastId: null,
  connection: null,
  ...over,
});

const ask = (over: Partial<BrokerAsk> = {}): BrokerAsk => ({
  askId: "a1",
  requestId: "r1",
  kind: "referral",
  status: "asked",
  requestStatus: "open",
  askedAt: "2026-11-24T10:00:00Z",
  expiresAt: "2026-11-26T10:00:00Z",
  seenAt: null,
  company: "Swiggy",
  jobFunction: "product",
  experienceBand: "3_7",
  roleTitle: "Product Manager",
  jobUrl: "https://jobs.example.com/pm",
  message: "Referral request: Product Manager at Swiggy",
  details: { purpose: "referral", role: "Product Manager", company: "Swiggy", jobUrl: "https://jobs.example.com/pm", fit: "Two years on payments.", resumeUrl: null },
  asker: { personId: "asker", fullName: "Asha Rao", institutionName: "IIT (BHU) Varanasi", batchYear: 2021, departmentCode: "cse" },
  askerContact: null,
  ...over,
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  assertGet.mockImplementation(async (path: string) => {
    if (path === "/v1/broker-requests/referral-companies") return { companies: [{ company: "Swiggy", alumni: 6 }] };
    if (path === "/v1/me/occupations") return { occupations: [{ id: "o1", occupationTypeCode: "full_time_employment", roleTitle: "PM", isCurrent: true, organizationName: "Acme" }] };
    if (path === "/v1/broker-asks") return { asks: [ask()] };
    if (path === "/v1/broker-requests") return { requests: [request()] };
    throw new Error(`unexpected ${path}`);
  });
  getMock.mockImplementation(async (path: string) => {
    if (path.startsWith("/v1/broker-requests/referral-eligible")) {
      const company = decodeURIComponent(path.split("company=")[1]!);
      return { data: { company: company.toLowerCase() === "swiggy" ? "Swiggy" : company, count: company.toLowerCase() === "swiggy" ? 6 : 0 } };
    }
    if (path.startsWith("/v1/broker-requests/hiring-eligible")) return { data: { count: 12 } };
    if (path === "/v1/intentcasts/audience-options") return { error: { code: "NOT_FOUND" } };
    return { error: { code: "NOT_FOUND" } };
  });
  postMock.mockImplementation(async (path: string) => {
    if (path === "/v1/broker-requests") return { data: { request: request() } };
    if (path === "/v1/intentcasts") return { data: { intentcast: { id: "post-1" } } };
    if (path.endsWith("/respond")) return { data: { status: "connected", askerContact: "asha@example.com", askerName: "Asha Rao" } };
    return { data: {} };
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("progress, like a ride booking", () => {
  it("open and unseen: sent, waiting for someone to see it", () => {
    expect(progressStages(request()).map((s) => [s.label, s.state])).toEqual([
      ["Request received", "done"],
      ["Sent to 6 alumni at Swiggy", "done"],
      ["Waiting for someone to see it", "current"],
      ["Someone says yes, and we connect you", "todo"],
    ]);
  });

  it("seen, then connected, or closed when no one was available", () => {
    expect(progressStages(request({ seenCount: 2 }))[2]).toEqual({ key: "seen", label: "2 have seen it", state: "done" });
    expect(progressStages(request({ seenCount: 2 }))[3]!.state).toBe("current");
    const connected = request({ status: "connected", seenCount: 1, connection: { personId: "h", fullName: "Vikram Iyer", contactShared: "v@example.com" } });
    expect(progressStages(connected)[3]).toEqual({ key: "result", label: "Vikram Iyer said yes. You're connected", state: "done" });
    expect(progressStages(request({ status: "expired" }))[3]).toEqual({ key: "result", label: "Closed: no one was available this time", state: "closed" });
    expect(progressStages(request({ kind: "hiring" }))[1]!.label).toBe("Sent to 6 alumni who match your role");
  });

  it("says when it closes", () => {
    const now = Date.parse("2026-11-24T10:00:00Z");
    expect(closesInLabel("2026-11-26T10:00:00Z", now)).toBe("Closes in 2 days");
    expect(closesInLabel("2026-11-24T15:00:00Z", now)).toBe("Closes in 5 hours");
    expect(closesInLabel("2026-11-24T10:20:00Z", now)).toBe("Closes within the hour");
  });
});

describe("function and experience", () => {
  it("experience comes from the graduation year; the hiring header is built from the taps", () => {
    const now = new Date("2026-11-24T00:00:00Z");
    expect(experienceBandForBatchYear(2028, now)).toBe("intern");
    expect(experienceBandForBatchYear(2025, now)).toBe("0_3");
    expect(experienceBandForBatchYear(2021, now)).toBe("3_7");
    expect(experienceBandForBatchYear(2015, now)).toBe("7_plus");
    expect(hiringHeaderLine({ jobFunction: "product", experience: "3_7", location: "Bengaluru", company: "Acme" })).toBe("Hiring · Product · 3–7 yrs · Bengaluru · Acme");
  });

  it("the profile setup asks for the function only when the API knows about it", () => {
    expect(setupSteps({ occupations: [], areas: [], openTo: null }).map((s) => s.key)).toEqual(["role", "areas", "openTo"]);
    const steps = setupSteps({ occupations: [], areas: [], openTo: null, jobFunction: null });
    expect(steps.map((s) => s.key)).toEqual(["role", "function", "areas", "openTo"]);
    expect(setupSteps({ occupations: [], areas: [], openTo: null, jobFunction: "data" })[1]!.done).toBe(true);
  });
});

describe("Wall rows for structured hiring posts", () => {
  const base = {
    id: "h1",
    authorPersonId: "poster",
    authorFullName: "Poster Person",
    authorDepartmentCode: "cse",
    authorDepartmentName: "CSE",
    category: "hiring",
    content: "Own the refunds flow end to end.",
    status: "open",
    expiresAt: "2099-01-01",
    closedAt: null,
    createdAt: new Date().toISOString(),
    editableUntil: "2099-01-01",
    responseCount: 0,
    viewerHasResponded: false,
  } as unknown as IntentcastFeedItem;

  it("header from the taps; title is the role (or the function); reach out vs apply", () => {
    const reach = mapIntentcastToRow({
      ...base,
      hiring: { jobFunction: "product", roleTitle: null, experience: "3_7", location: "Bengaluru", company: "Acme", respondVia: "reachout", applyUrl: null },
    })!;
    expect(reach.headerLine).toBe("Hiring · Product · 3–7 yrs · Bengaluru · Acme");
    expect(reach.roleHeader).toBe("Product role");
    expect(reach.companySubtitle).toBe("Acme · Bengaluru");
    expect(reach.summary).toBe("Own the refunds flow end to end.");
    expect(reach.reachOut).toEqual({ role: null, company: "Acme" });
    expect(reach.roleListingUrl).toBeNull();
    const link = mapIntentcastToRow({
      ...base,
      hiring: { jobFunction: "design", roleTitle: "Senior Designer", experience: "7_plus", location: "Remote", company: null, respondVia: "link", applyUrl: "https://jobs.example.com/d" },
    })!;
    expect(link.roleHeader).toBe("Senior Designer");
    expect(link.roleListingUrl).toBe("https://jobs.example.com/d");
    expect(link.reachOut).toBeNull();
  });
});

describe("Get a referral (brokered)", () => {
  it("tells you how many alumni will be asked before you send, and reveals one answer at a time", async () => {
    wrap(<ReferralRequestFlow onClose={vi.fn()} />);
    expect(screen.queryByRole("radiogroup", { name: "Which function?" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Nobodyco" } });
    expect(await screen.findByText("No alumni at Nobodyco on Alma Mater yet. Try a related company.")).toBeTruthy();
    expect(screen.queryByRole("radiogroup", { name: "Which function?" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "swiggy" } });
    expect(await screen.findByText("We'll ask 6 alumni at Swiggy.")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Product" }));
    expect(screen.getByRole("radio", { name: "Product" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.change(screen.getByLabelText(/^Role/), { target: { value: "Product Manager" } });
    fireEvent.change(screen.getByLabelText(/^Job link/), { target: { value: "https://jobs.example.com/pm" } });
    fireEvent.change(screen.getByLabelText(/^Why you're a fit/), {
      target: { value: "Two years as a product analyst on the payments team, where I shipped the refunds flow end to end." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask 6 alumni" }));
    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/v1/broker-requests", {
        kind: "referral",
        jobFunction: "product",
        note: expect.objectContaining({ purpose: "referral", company: "Swiggy", role: "Product Manager", jobUrl: "https://jobs.example.com/pm" }),
      }),
    );
    expect(await screen.findByRole("heading", { name: "Request sent" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Request progress" })).toBeTruthy();
  });
});

describe("Requests for you", () => {
  it("marks new asks seen, and yes connects with the asker's contact shown", async () => {
    assertGet.mockImplementation(async (path: string) => {
      if (path === "/v1/broker-asks") return { asks: postMock.mock.calls.some((c) => String(c[0]).endsWith("/respond")) ? [ask({ status: "accepted", askerContact: "asha@example.com" })] : [ask()] };
      throw new Error(`unexpected ${path}`);
    });
    wrap(<BrokerAsksSection enabled />);
    expect(await screen.findByText(/is looking for a referral at Swiggy/)).toBeTruthy();
    await waitFor(() => expect(postMock).toHaveBeenCalledWith("/v1/broker-asks/a1/seen"));
    fireEvent.click(screen.getByRole("button", { name: "Yes, I'll refer" }));
    await waitFor(() => expect(postMock).toHaveBeenCalledWith("/v1/broker-asks/a1/respond", { action: "accept" }));
    expect(await screen.findByText(/you can reach them at asha@example.com/)).toBeTruthy();
  });

  it("someone else got there first: says so", async () => {
    postMock.mockImplementation(async (path: string) =>
      path.endsWith("/respond") ? { error: { code: "BROKER_ALREADY_HELPED", message: "Someone already helped with this one. Thank you!" } } : { data: {} },
    );
    wrap(<BrokerAsksSection enabled />);
    fireEvent.click(await screen.findByRole("button", { name: "Yes, I'll refer" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Someone already helped with this one. Thank you!");
  });

  it("your requests: progress, and the contact once connected", async () => {
    assertGet.mockImplementation(async () => ({
      requests: [request({ status: "connected", seenCount: 1, connection: { personId: "h", fullName: "Vikram Iyer", contactShared: "v@example.com" } })],
    }));
    wrap(<BrokerRequestsSection enabled />);
    expect(await screen.findByText("Referral · Swiggy · Product Manager")).toBeTruthy();
    expect(screen.getByText(/v@example.com/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Vikram Iyer" }).getAttribute("href")).toBe("/profiles/h");
  });
});

describe("Wall composer: Careers, one tap at a time", () => {
  function mountComposer() {
    const ref = createRef<PostBulletinFlowHandle>();
    wrap(<PostBulletinFlow ref={ref} />);
    act(() => ref.current?.open());
    return ref;
  }

  it("category first, then Hiring · Referral · Guidance", () => {
    mountComposer();
    expect(screen.getByRole("radiogroup", { name: "What's this about?" })).toBeTruthy();
    expect(screen.queryByLabelText(/Headline/)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Careers" }));
    const track = screen.getByRole("radiogroup", { name: "What do you need?" });
    expect([...track.querySelectorAll("[role=radio]")].map((b) => b.textContent)).toEqual(["Hiring", "Referral", "Guidance"]);
    expect(screen.queryByLabelText(/Headline/)).toBeNull();
  });

  it("Hiring: taps, no heading, and optionally asks matching alumni privately", async () => {
    mountComposer();
    fireEvent.click(screen.getByRole("radio", { name: "Careers" }));
    fireEvent.click(screen.getByRole("radio", { name: "Hiring" }));
    expect(screen.queryByRole("radiogroup", { name: "Experience level?" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Product" }));
    fireEvent.change(screen.getByLabelText(/^Role title/), { target: { value: "Senior PM, Payments" } });
    fireEvent.click(screen.getByRole("radio", { name: "3–7 yrs" }));
    fireEvent.click(screen.getByRole("radio", { name: "Bengaluru" }));
    await waitFor(() => expect((screen.getByLabelText(/^Company/) as HTMLInputElement).value).toBe("Acme"));
    fireEvent.click(screen.getByRole("radio", { name: "Reach out to me" }));
    fireEvent.change(screen.getByLabelText(/^Details/), { target: { value: "Small payments team, you'd own refunds end to end." } });
    expect(screen.getByLabelText("Card header preview").textContent).toBe("Hiring · Product · 3–7 yrs · Bengaluru · Acme");
    expect(await screen.findByText(/We'll ask 12 alumni with this function and experience/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Also ask matching alumni privately/));
    fireEvent.click(screen.getByRole("button", { name: "Post and ask alumni" }));
    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/v1/intentcasts", {
        category: "hiring",
        content: "Small payments team, you'd own refunds end to end.",
        hiring: {
          jobFunction: "product",
          roleTitle: "Senior PM, Payments",
          experience: "3_7",
          location: "Bengaluru",
          company: "Acme",
          respondVia: "reachout",
          applyUrl: null,
        },
      }),
    );
    await waitFor(() => expect(postMock).toHaveBeenCalledWith("/v1/broker-requests", { kind: "hiring", intentcastId: "post-1" }));
    expect(await screen.findByText("Your role is on the Wall, and we've privately asked 6 matching alumni.")).toBeTruthy();
  });

  it("Hiring: function, experience and how to respond are required", () => {
    mountComposer();
    fireEvent.click(screen.getByRole("radio", { name: "Careers" }));
    fireEvent.click(screen.getByRole("radio", { name: "Hiring" }));
    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(screen.getByText("Pick a function")).toBeTruthy();
    expect(postMock.mock.calls.some((c) => c[0] === "/v1/intentcasts")).toBe(false);
  });

  it("Referral is brokered: it opens the referral request instead of a Wall post", () => {
    mountComposer();
    fireEvent.click(screen.getByRole("radio", { name: "Careers" }));
    fireEvent.click(screen.getByRole("radio", { name: "Referral" }));
    expect(screen.getByRole("dialog", { name: "Get a referral" })).toBeTruthy();
  });

  it("Guidance: the body only, with the header line in place of a heading", async () => {
    mountComposer();
    fireEvent.click(screen.getByRole("radio", { name: "Careers" }));
    fireEvent.click(screen.getByRole("radio", { name: "Guidance" }));
    fireEvent.change(screen.getByLabelText(/^Details/), { target: { value: "Weighing an offer from a startup against my current role." } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith(
        "/v1/intentcasts",
        expect.objectContaining({ category: "guidance", content: expect.stringContaining("Career guidance\nWeighing an offer") }),
      ),
    );
  });
});

describe("admin: requests on WhatsApp", () => {
  it("starts off and an admin can turn it on", async () => {
    assertGet.mockImplementation(async () => ({ enabled: false }));
    putMock.mockImplementation(async () => ({ data: { enabled: true } }));
    wrap(<BrokerWhatsAppSetting />);
    expect(await screen.findByText(/Off: referral and hiring asks go by email and in the app only/)).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Turn on" }));
    await waitFor(() => expect(putMock).toHaveBeenCalledWith("/v1/admin/settings/broker-whatsapp", { enabled: true }));
    expect(await screen.findByText(/On: referral and hiring asks also go/)).toBeTruthy();
  });
});
