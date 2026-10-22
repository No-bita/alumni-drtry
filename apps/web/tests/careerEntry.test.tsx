import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const flows = vi.hoisted(() => ({ hiring: vi.fn(), bulletin: vi.fn() }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ status: "authenticated", person: { personId: "p1", institutionalEmail: "a@iitbhu.ac.in" }, myProfile: { fullName: "Alum" } }) }));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: vi.fn().mockResolvedValue({ intentcasts: [] }) }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <h1 id="career-toolbar-title">Careers</h1> }));
vi.mock("../src/components/CareerIntentFeedRows", () => ({ CareerIntentFeedRows: () => <p>Existing feed and filters</p> }));
vi.mock("../src/components/PostRoleHiringFlow", async () => {
  const { useImperativeHandle } = await import("react");
  return { PostRoleHiringFlow: ({ ref }: { ref: import("react").Ref<{ open: () => void }> }) => { useImperativeHandle(ref, () => ({ open: flows.hiring })); return null; } };
});
vi.mock("../src/components/PostBulletinFlow", async () => {
  const { useImperativeHandle } = await import("react");
  return { PostBulletinFlow: ({ ref }: { ref: import("react").Ref<{ open: (p: unknown) => void }> }) => { useImperativeHandle(ref, () => ({ open: flows.bulletin })); return null; } };
});
import { CareerPage } from "../src/pages/CareerPage";
afterEach(cleanup);
function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={qc}><CareerPage /></QueryClientProvider></MemoryRouter>);
}
describe("approved Careers entry", () => {
  it("keeps referral first and routes each task to its existing composer", () => {
    mount();
    expect(screen.getAllByRole("button").slice(0, 2).map(b => b.textContent)).toEqual(["Ask for a referral", "Hire alumni"]);
    fireEvent.click(screen.getByRole("button", { name: "Ask for a referral" }));
    expect(flows.bulletin).toHaveBeenCalledWith({ careersPreset: "referralSeeking" });
    fireEvent.click(screen.getByRole("button", { name: "Hire alumni" }));
    expect(flows.hiring).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Offer help" }));
    expect(flows.bulletin).toHaveBeenCalledWith({ careersPreset: "canHelp" });
    expect(screen.getByRole("link", { name: "Browse alumni" }).getAttribute("href")).toBe("/search");
  });
  it("expands and hides the existing activity rather than removing it", () => {
    mount();
    expect(screen.queryByRole("region", { name: "Activity" })).toBeNull();
    const view = screen.getByRole("button", { name: "View all" });
    expect(view.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(view);
    expect(screen.getByRole("region", { name: "Activity" })).toBeTruthy();
    expect(screen.getByText("Existing feed and filters")).toBeTruthy();
    const hide = screen.getByRole("button", { name: "Hide" });
    expect(hide.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(hide);
    expect(screen.queryByRole("region", { name: "Activity" })).toBeNull();
  });
});
