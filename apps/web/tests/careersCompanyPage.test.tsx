import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const wall = vi.hoisted(() => ({ open: vi.fn(), onPublish: null as null | (() => void) }));
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({ status: "authenticated", person: { personId: "p1", role: "alumni" }, myProfile: { id: "me1", fullName: "Me" } }),
}));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: apiGet }));
vi.mock("../src/api/client", async (orig) => ({ ...(await orig<Record<string, unknown>>()), api: { post: apiPost } }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));
vi.mock("../src/components/PostBulletinFlow", async () => {
  const { useImperativeHandle } = await import("react");
  return {
    PostBulletinFlow: ({ ref, onPublishSuccess }: { ref: import("react").Ref<{ open: (o: unknown) => void }>; onPublishSuccess: () => void }) => {
      wall.onPublish = onPublishSuccess;
      useImperativeHandle(ref, () => ({ open: wall.open }));
      return null;
    },
  };
});

import { CareerCompanyPage } from "../src/pages/CareerCompanyPage";

const person = (id: string, fullName: string, extra: Record<string, unknown> = {}) => ({
  id, fullName, batchYear: 2019, roleTitle: "Product Manager", organizationName: "Razorpay", openToReferrals: false, yourNote: null, ...extra,
});

function mount(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/intent/career/company" element={<CareerCompanyPage />} />
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  wall.open.mockReset();
  apiPost.mockResolvedValue({ data: { contactRequest: { id: "c1" } } });
});
afterEach(cleanup);

describe("Careers company screen", () => {
  it("lists who's there now (open to referrals first) and before, and asks the API with the role", async () => {
    apiGet.mockResolvedValue({
      company: "Razorpay",
      current: [person("a", "Asha Rao", { openToReferrals: true }), person("b", "Bilal Khan", { roleTitle: "Engineer" })],
      past: [person("c", "Chirag Jain", { organizationName: "Razorpay", roleTitle: "Analyst" })],
    });
    mount("/intent/career/company?name=razorpay&role=Product+manager");
    expect(screen.getByRole("status").textContent).toContain("Finding alumni at razorpay");
    expect(await screen.findByRole("heading", { name: "Razorpay" })).toBeTruthy();
    expect(apiGet).toHaveBeenCalledWith("/v1/careers/company?name=razorpay&role=Product+manager", expect.anything());
    expect(screen.getByText("2 alumni at Razorpay · 1 open to referrals")).toBeTruthy();
    const open = screen.getByRole("heading", { name: "Open to referrals" }).closest("section")!;
    expect(within(open).getByRole("button", { name: "Ask for a referral" })).toBeTruthy();
    const also = screen.getByRole("heading", { name: "Also at Razorpay" }).closest("section")!;
    expect(within(also).getByRole("button", { name: "Ask for advice" })).toBeTruthy();
    const past = screen.getByRole("heading", { name: "Used to work at Razorpay" }).closest("section")!;
    expect(within(past).getByRole("button", { name: "Ask for advice" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Send a note|Ask about it/ })).toBeNull();
    expect(within(past).getByText(/Analyst at Razorpay/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "← Careers" }).getAttribute("href")).toBe("/intent/career");
  });

  it("someone you've already asked shows where it stands instead of the button", async () => {
    apiGet.mockResolvedValue({ company: "Razorpay", current: [person("a", "Asha Rao", { openToReferrals: true, yourNote: "pending" })], past: [] });
    mount("/intent/career/company?name=Razorpay");
    expect(await screen.findByText("Note sent · waiting")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ask for a referral" })).toBeNull();
  });

  it("referral ask: the referral form, prefilled with role and company; job link checked; preview; sent as a Careers note", async () => {
    apiGet.mockResolvedValue({ company: "Razorpay", current: [person("a", "Asha Rao", { openToReferrals: true })], past: [] });
    mount("/intent/career/company?name=Razorpay&role=Product+manager");
    fireEvent.click(await screen.findByRole("button", { name: "Ask for a referral" }));
    const dialog = screen.getByRole("dialog", { name: "Ask Asha for a referral" });
    expect((within(dialog).getByLabelText("Role") as HTMLInputElement).value).toBe("Product manager");
    expect((within(dialog).getByLabelText("Company") as HTMLInputElement).value).toBe("Razorpay");
    fireEvent.change(within(dialog).getByLabelText("Job link"), { target: { value: "jobs.razorpay.com/pm" } });
    expect(within(dialog).getByRole("alert").textContent).toContain("https://");
    const fit = "Three years building merchant onboarding at a payments startup; I led the KYC revamp end to end.";
    fireEvent.change(within(dialog).getByLabelText("Why you’re a fit"), { target: { value: fit } });
    expect((within(dialog).getByRole("button", { name: "Preview your note" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Job link"), { target: { value: "https://jobs.razorpay.com/pm" } });
    fireEvent.change(within(dialog).getByLabelText(/Résumé link/), { target: { value: "https://drive.example.com/cv" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Preview your note" }));
    expect(within(dialog).getByRole("heading", { name: "This is what Asha sees" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Send note" }));
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/v1/contact-requests", {
        recipientPersonId: "a",
        note: {
          purpose: "referral",
          jobUrl: "https://jobs.razorpay.com/pm",
          role: "Product manager",
          company: "Razorpay",
          fit,
          resumeUrl: "https://drive.example.com/cv",
        },
        source: "careers",
      }),
    );
    expect(await screen.findByRole("heading", { name: "Note sent to Asha" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Careers" }).getAttribute("href")).toBe("/intent/career");
  });

  it("past employee: 'Ask for advice' opens advice (interview prep), starting from where they're applying", async () => {
    apiGet.mockResolvedValue({ company: "Microsoft", current: [], past: [person("c", "Chirag Jain", { organizationName: "Microsoft" })] });
    mount("/intent/career/company?name=Microsoft");
    fireEvent.click(await screen.findByRole("button", { name: "Ask for advice" }));
    const dialog = screen.getByRole("dialog", { name: "Ask Chirag for advice" });
    expect(within(dialog).queryByLabelText("Job link")).toBeNull();
    const q = within(dialog).getByLabelText("Your question") as HTMLTextAreaElement;
    expect(q.value).toBe("I'm applying to Microsoft. ");
    // The starter alone is too short: they must add their own question.
    expect((within(dialog).getByRole("button", { name: "Preview your note" }) as HTMLButtonElement).disabled).toBe(true);
    const question = "I'm applying to Microsoft. What did the hiring loop look like for your team, and what would you prepare?";
    fireEvent.change(q, { target: { value: question } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Preview your note" }));
    expect(within(dialog).getByText("Advice · Interview prep")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Send note" }));
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/v1/contact-requests", {
        recipientPersonId: "c",
        note: { purpose: "advice", topic: "interview_prep", question },
        source: "careers",
      }),
    );
  });

  it("nobody there now or before: says so, and the Wall is the next step, prefilled; posting closes the loop", async () => {
    apiGet.mockResolvedValue({ company: "Microsoft", current: [], past: [] });
    mount("/intent/career/company?name=Microsoft&role=SDE");
    expect(await screen.findByText("No one at Microsoft on Alma Mater yet.")).toBeTruthy();
    expect(screen.getByText("No one on Alma Mater has worked there either.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Post it on the Wall" }));
    expect(wall.open).toHaveBeenCalledWith({ careersPreset: "referralSeeking", referralCompanyName: "Microsoft", headline: "SDE" });
    wall.onPublish?.();
    expect(await screen.findByText(/Posted\. It's under Recent from alumni/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Try another company" }).getAttribute("href")).toBe("/intent/career");
  });

  it("load failure: says so and can try again; no name: points back to Careers", async () => {
    apiGet.mockRejectedValueOnce(new Error("down"));
    mount("/intent/career/company?name=Razorpay");
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load alumni at Razorpay");
    apiGet.mockResolvedValue({ company: "Razorpay", current: [], past: [] });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Razorpay" })).toBeTruthy();
    cleanup();
    mount("/intent/career/company");
    expect(screen.getByText(/to see who's there/)).toBeTruthy();
    expect(apiGet).toHaveBeenCalledTimes(2);
  });
});
