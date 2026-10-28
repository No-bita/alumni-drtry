import { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const post = vi.hoisted(() => vi.fn());
const getJson = vi.hoisted(() => vi.fn());
const bulletinOpen = vi.hoisted(() => vi.fn());

vi.mock("../src/api/client", () => ({ api: { post } }));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: getJson }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({ status: "authenticated", myProfile: { fullName: "Viewer Person" } }),
}));
vi.mock("../src/components/PostBulletinFlow", () => ({
  PostBulletinFlow: forwardRef(function MockFlow(_props, ref) {
    useImperativeHandle(ref, () => ({ open: bulletinOpen, close: vi.fn() }));
    return null;
  }),
}));

import { MatchPage } from "../src/pages/MatchPage";

const intent = {
  category: "referral",
  company: "Razorpay",
  role: "Product Manager",
  fromRole: null,
  city: null,
  country: null,
  studyPrograms: [],
  keywords: [],
  source: "rules",
};

const result = {
  id: "11111111-1111-1111-1111-111111111111",
  fullName: "Ananya Rao",
  batchYear: 2016,
  departmentCode: "eee",
  departmentName: "Electrical Engineering",
  headlineRoleTitle: "Senior Product Manager",
  headlineOrganizationName: "Razorpay",
  residenceCity: "Bengaluru",
  residenceCountry: "India",
  whyThem: "Currently Senior Product Manager at Razorpay · Open to referrals",
  reasons: [
    { key: "current_company", text: "Currently Senior Product Manager at Razorpay" },
    { key: "open_to", text: "Open to referrals" },
  ],
  openTo: ["referrals", "coffee"],
  relevantOpenTo: ["referrals"],
};

function LocationProbe() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function mount(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route
            path="/match"
            element={
              <>
                <MatchPage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  post.mockReset();
  getJson.mockReset();
  bulletinOpen.mockReset();
});
afterEach(cleanup);

describe("MatchPage", () => {
  it("sends the question and renders the factual why-them", async () => {
    post.mockResolvedValue({ data: { intent, needsDetail: false, results: [result], fallback: null } });
    mount("/match?q=referral+for+PM+at+Razorpay");
    expect(await screen.findByText("Ananya Rao", { selector: "a" })).toBeTruthy();
    expect(post).toHaveBeenCalledWith("/v1/match", { question: "referral for PM at Razorpay" }, expect.anything());
    expect(screen.getByText("Currently Senior Product Manager at Razorpay")).toBeTruthy();
    expect(screen.getByText("1 alum who can help")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Looking for" })).toHaveProperty("value", "referral");
  });

  it("clearing a chip puts the correction in the URL and re-asks", async () => {
    post.mockResolvedValue({ data: { intent, needsDetail: false, results: [result], fallback: null } });
    mount("/match?q=referral+for+PM+at+Razorpay");
    fireEvent.click(await screen.findByRole("button", { name: "Remove company" }));
    await waitFor(() => expect(screen.getByTestId("search").textContent).toContain("company="));
    await waitFor(() =>
      expect(post).toHaveBeenLastCalledWith(
        "/v1/match",
        { question: "referral for PM at Razorpay", overrides: { company: null } },
        expect.anything(),
      ),
    );
  });

  it("offers to post a bulletin when nobody matches", async () => {
    post.mockResolvedValue({ data: { intent, needsDetail: false, results: [], fallback: "post_bulletin" } });
    mount("/match?q=referral+for+PM+at+Razorpay");
    fireEvent.click(await screen.findByRole("button", { name: "Post this as a bulletin" }));
    expect(bulletinOpen).toHaveBeenCalledWith({ category: "careers", headline: "referral for PM at Razorpay" });
  });

  it("asks for the missing city on a vague relocation question", async () => {
    post.mockResolvedValue({
      data: { intent: { ...intent, category: "relocation", company: null, role: null }, needsDetail: true, results: [], fallback: null },
    });
    mount("/match?q=Moving+to+a+new+city");
    expect(await screen.findByText("Which city are you moving to?")).toBeTruthy();
    expect(screen.getByLabelText("City")).toBeTruthy();
  });

  it("reach out sends a contact request with the drafted note", async () => {
    post.mockImplementation(async (path: string) =>
      path === "/v1/match"
        ? { data: { intent, needsDetail: false, results: [result], fallback: null } }
        : { data: { contactRequest: { id: "x" } } },
    );
    mount("/match?q=Need+a+referral+at+Razorpay");
    fireEvent.click(await screen.findByRole("button", { name: "Reach out" }));
    const note = screen.getByLabelText("What are you hoping to talk about?") as HTMLTextAreaElement;
    expect(note.value).toContain("Hi Ananya, I found you on Alma Mater. Need a referral at Razorpay");
    fireEvent.click(screen.getByRole("button", { name: "Send note" }));
    expect(await screen.findByText("Note sent to Ananya")).toBeTruthy();
    expect(post).toHaveBeenCalledWith("/v1/contact-requests", {
      recipientPersonId: result.id,
      message: note.value.trim(),
      source: "match",
      sourceCategory: "referral",
      // Top result: position 1, for ranking-quality analytics.
      sourceRank: 1,
    });
  });

  it("shows a friendly message when rate limited", async () => {
    post.mockResolvedValue({ error: { code: "DISCOVERY_RATE_LIMITED", message: "x" }, retryAfterSeconds: 30 });
    mount("/match?q=referral+at+Razorpay");
    expect(await screen.findByText("Too many searches in a short time. Try again in a minute.")).toBeTruthy();
  });
});

describe("MatchPage — filling a missing field", () => {
  it("after saving a city, the chip shows the city instead of reopening empty", async () => {
    const vague = { ...intent, category: "relocation", company: null, role: null };
    let resolveSecond: (v: unknown) => void = () => {};
    post
      .mockResolvedValueOnce({ data: { intent: vague, needsDetail: true, results: [], fallback: null } })
      .mockImplementationOnce(() => new Promise((r) => (resolveSecond = r)));
    mount("/match?q=Moving+to+a+new+city");
    const cityInput = await screen.findByLabelText("City");
    fireEvent.change(cityInput, { target: { value: "Pune" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // While the new request is in flight, the old needsDetail response must not reopen the chip.
    await waitFor(() => expect(screen.getByTestId("search").textContent).toContain("city=Pune"));
    expect(screen.queryByLabelText("City")).toBeNull();
    resolveSecond({
      data: { intent: { ...vague, city: "Pune", country: "India" }, needsDetail: false, results: [], fallback: "post_bulletin" },
    });
    expect(await screen.findByRole("button", { name: "City: Pune. Edit" })).toBeTruthy();
    expect(screen.queryByLabelText("City")).toBeNull();
  });
});

describe("MatchPage — reach-out loop", () => {
  it("shows 'Note sent' instead of Reach out when a note is pending, and the reply line when present", async () => {
    post.mockResolvedValue({
      data: {
        intent,
        needsDetail: false,
        results: [{ ...result, yourNote: "pending", replyStats: { total: 5, replied: 4, medianDays: 2 } }],
        fallback: null,
      },
    });
    mount("/match?q=referral+at+Razorpay");
    expect(await screen.findByText(/Note sent · waiting for reply/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reach out" })).toBeNull();
    expect(screen.getByText("Replied to 4 of 5 notes · usually within 2 days")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See your notes" }).getAttribute("href")).toBe("/notifications");
  });

  it("shows no reply line without enough data, and the server's duplicate message on 409", async () => {
    post.mockImplementation(async (path: string) =>
      path === "/v1/match"
        ? { data: { intent, needsDetail: false, results: [{ ...result, yourNote: null, replyStats: null }], fallback: null } }
        : { error: { code: "CONTACT_REQUEST_DUPLICATE_PENDING", message: "You already have a note waiting for Ananya Rao." } },
    );
    mount("/match?q=referral+at+Razorpay");
    fireEvent.click(await screen.findByRole("button", { name: "Reach out" }));
    expect(screen.queryByText(/Replied to/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send note" }));
    expect(await screen.findByText("You already have a note waiting for Ananya Rao.")).toBeTruthy();
  });
});

describe("MatchPage — from the WhatsApp bot", () => {
  it("opens the note box for the linked person and records the note as coming from WhatsApp", async () => {
    post.mockImplementation(async (path: string) =>
      path === "/v1/match"
        ? { data: { intent, needsDetail: false, results: [result], fallback: null } }
        : { data: { contactRequest: { id: "x" } } },
    );
    mount(`/match?q=Referral+at+Razorpay&reach=${result.id}&via=whatsapp`);
    const note = (await screen.findByLabelText("What are you hoping to talk about?")) as HTMLTextAreaElement;
    fireEvent.click(screen.getByRole("button", { name: "Send note" }));
    expect(await screen.findByText("Note sent to Ananya")).toBeTruthy();
    expect(post).toHaveBeenCalledWith("/v1/contact-requests", {
      recipientPersonId: result.id,
      message: note.value.trim(),
      source: "whatsapp",
      sourceCategory: "referral",
      sourceRank: 1,
    });
  });

  it("uses the bot's reading of the question (company, referral) so the website shows the same list", async () => {
    post.mockResolvedValue({ data: { intent, needsDetail: false, results: [result], fallback: null } });
    mount(`/match?q=Referral+at+razorpay%2C+pm&cat=referral&company=Razorpay&reach=${result.id}&via=whatsapp`);
    await screen.findByLabelText("What are you hoping to talk about?");
    expect(post).toHaveBeenCalledWith(
      "/v1/match",
      { question: "Referral at razorpay, pm", overrides: { category: "referral", company: "Razorpay" } },
      expect.anything(),
    );
  });

  it("they tapped Send a note for someone who's no longer in the list: their note box still opens", async () => {
    const priya = "22222222-2222-2222-2222-222222222222";
    getJson.mockResolvedValue({ profile: { id: priya, fullName: "Priya Sharma" }, occupations: [], links: [] });
    post.mockImplementation(async (path: string) =>
      path === "/v1/match"
        ? { data: { intent, needsDetail: false, results: [result], fallback: null } }
        : { data: { contactRequest: { id: "x" } } },
    );
    mount(`/match?q=Referral+at+Razorpay&cat=referral&company=Razorpay&reach=${priya}&via=whatsapp`);
    const note = (await screen.findByLabelText("What are you hoping to talk about?")) as HTMLTextAreaElement;
    expect(getJson).toHaveBeenCalledWith(`/v1/profiles/${priya}`, expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Send note" }));
    expect(await screen.findByText("Note sent to Priya")).toBeTruthy();
    expect(post).toHaveBeenCalledWith("/v1/contact-requests", {
      recipientPersonId: priya,
      message: note.value.trim(),
      source: "whatsapp",
      sourceCategory: "referral",
    });
  });

  it("doesn't reopen the note box for someone they've already sent a note to", async () => {
    post.mockResolvedValue({ data: { intent, needsDetail: false, results: [{ ...result, yourNote: "pending" }], fallback: null } });
    mount(`/match?q=Referral+at+Razorpay&reach=${result.id}&via=whatsapp`);
    expect(await screen.findByText("Ananya Rao", { selector: "a" })).toBeTruthy();
    expect(screen.queryByLabelText("What are you hoping to talk about?")).toBeNull();
    expect(getJson).not.toHaveBeenCalled();
  });
});

describe("MatchPage — from a Careers topic shortcut", () => {
  it("shows the topic's prompt and keeps the topic on the first question", async () => {
    post.mockResolvedValue({ data: { intent: { ...intent, category: "interview_prep" }, needsDetail: false, results: [result], fallback: null } });
    mount("/match?cat=interview_prep");
    expect(screen.getByText(/Which company or role are you interviewing for\?/)).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "Google SDE interview next month" } });
    fireEvent.click(screen.getByRole("button", { name: "Find alumni" }));
    await waitFor(() => expect(screen.getByTestId("search").textContent).toBe("?q=Google+SDE+interview+next+month&cat=interview_prep"));
    // A later new question starts fresh, as before.
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "Moving to Pune for work" } });
    fireEvent.click(screen.getByRole("button", { name: "Find alumni" }));
    await waitFor(() => expect(screen.getByTestId("search").textContent).toBe("?q=Moving+to+Pune+for+work"));
  });
});
