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
    expect(within(also).getByRole("button", { name: "Send a note" })).toBeTruthy();
    const past = screen.getByRole("heading", { name: "Used to work at Razorpay" }).closest("section")!;
    expect(within(past).getByText(/Analyst at Razorpay/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "← Careers" }).getAttribute("href")).toBe("/intent/career");
  });

  it("someone you've already asked shows where it stands instead of the button", async () => {
    apiGet.mockResolvedValue({ company: "Razorpay", current: [person("a", "Asha Rao", { openToReferrals: true, yourNote: "pending" })], past: [] });
    mount("/intent/career/company?name=Razorpay");
    expect(await screen.findByText("Note sent · waiting")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ask for a referral" })).toBeNull();
  });

  it("referral ask: tailored note with optional job and résumé links, checked, then sent as a Careers note", async () => {
    apiGet.mockResolvedValue({ company: "Razorpay", current: [person("a", "Asha Rao", { openToReferrals: true })], past: [] });
    mount("/intent/career/company?name=Razorpay&role=Product+manager");
    fireEvent.click(await screen.findByRole("button", { name: "Ask for a referral" }));
    const dialog = screen.getByRole("dialog", { name: "Ask Asha for a referral" });
    const note = within(dialog).getByLabelText("What are you hoping to talk about?") as HTMLTextAreaElement;
    expect(note.value).toBe(
      "Hi Asha, I found you on Alma Mater. I'm applying for the Product manager role at Razorpay. Would you be open to referring me? Happy to share my résumé and anything else you need.",
    );
    fireEvent.change(within(dialog).getByLabelText(/Job link/), { target: { value: "jobs.razorpay.com/pm" } });
    expect(within(dialog).getByRole("alert").textContent).toContain("https://");
    expect((within(dialog).getByRole("button", { name: "Send note" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Job link/), { target: { value: "https://jobs.razorpay.com/pm" } });
    fireEvent.change(within(dialog).getByLabelText(/Résumé link/), { target: { value: "https://drive.example.com/cv" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send note" }));
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/v1/contact-requests", {
        recipientPersonId: "a",
        message: `${note.value}\n\nJob: https://jobs.razorpay.com/pm\nRésumé: https://drive.example.com/cv`,
        source: "careers",
        sourceCategory: "referral",
      }),
    );
    expect(await screen.findByRole("heading", { name: "Note sent to Asha" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Careers" }).getAttribute("href")).toBe("/intent/career");
  });

  it("past employee: 'Ask about it' sends a plain note with no links or category", async () => {
    apiGet.mockResolvedValue({ company: "Microsoft", current: [], past: [person("c", "Chirag Jain", { organizationName: "Microsoft" })] });
    mount("/intent/career/company?name=Microsoft");
    fireEvent.click(await screen.findByRole("button", { name: "Ask about it" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByLabelText(/Job link/)).toBeNull();
    expect((within(dialog).getByLabelText("What are you hoping to talk about?") as HTMLTextAreaElement).value).toContain("saw you worked there");
    fireEvent.click(within(dialog).getByRole("button", { name: "Send note" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/contact-requests", expect.objectContaining({ source: "careers", sourceCategory: null })));
  });

  it("nobody there now or before: says so, and the Wall is the next step, prefilled; posting closes the loop", async () => {
    apiGet.mockResolvedValue({ company: "Microsoft", current: [], past: [] });
    mount("/intent/career/company?name=Microsoft&role=SDE");
    expect(await screen.findByText("No one from IIT BHU at Microsoft on Alma Mater yet.")).toBeTruthy();
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
