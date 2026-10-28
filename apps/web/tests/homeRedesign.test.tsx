import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const apiGet = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: apiGet }));

import { reassuranceLine, sentNotesSummary } from "../src/lib/homeSummary";
import { HomeReassurance } from "../src/components/HomeReassurance";
import { HomeSentNotesLine } from "../src/components/HomeSentNotesLine";
import { HomeBrowseRow } from "../src/components/HomeBrowseRow";
import { HomeOpportunityRail } from "../src/components/HomeOpportunityRail";
import { HomeFeedbackSection } from "../src/components/HomeFeedbackSection";
import { HomeToolbarSearch } from "../src/components/HomeToolbarSearch";

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => apiGet.mockReset());
afterEach(cleanup);

describe("reassurance line", () => {
  it("says all three counts when they are real", () => {
    expect(reassuranceLine({ alumni: 1240, companies: 310, openToReferrals: 86 })).toBe(
      "1,240 alumni across 310 companies · 86 open to referrals",
    );
  });
  it("leaves out any part that would read 0, and singulars read right", () => {
    expect(reassuranceLine({ alumni: 12, companies: 0, openToReferrals: 0 })).toBe("12 alumni");
    expect(reassuranceLine({ alumni: 1, companies: 1, openToReferrals: 1 })).toBe(
      "1 alum across 1 company · 1 open to referrals",
    );
  });
  it("says nothing when nobody can help yet", () => {
    expect(reassuranceLine({ alumni: 0, companies: 0, openToReferrals: 0 })).toBeNull();
  });
  it("renders the line from the API, and nothing when it would be zero", async () => {
    apiGet.mockResolvedValue({ alumni: 40, companies: 12, openToReferrals: 5 });
    wrap(<HomeReassurance />);
    expect(await screen.findByText("40 alumni across 12 companies · 5 open to referrals")).toBeTruthy();
    expect(apiGet).toHaveBeenCalledWith("/v1/home/summary", expect.anything());
    cleanup();
    apiGet.mockResolvedValue({ alumni: 0, companies: 0, openToReferrals: 0 });
    const { container } = wrap(<HomeReassurance />);
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
    expect(container.textContent).toBe("");
  });
});

describe("Your notes line", () => {
  it("counts waiting and accepted notes, never declined", () => {
    expect(
      sentNotesSummary([{ status: "pending" }, { status: "accepted" }, { status: "accepted" }, { status: "declined" }]),
    ).toEqual(["1 waiting for reply", "2 accepted"]);
    expect(sentNotesSummary([{ status: "declined" }])).toBeNull();
    expect(sentNotesSummary([])).toBeNull();
  });
  it("links to your notes, and hides when there is nothing to show", async () => {
    apiGet.mockResolvedValue({ requests: [{ status: "pending" }] });
    wrap(<HomeSentNotesLine />);
    expect(await screen.findByText(/1 waiting for reply/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "See your notes →" }).getAttribute("href")).toBe("/notifications");
    expect(apiGet).toHaveBeenCalledWith("/v1/contact-requests/sent", expect.anything());
    cleanup();
    apiGet.mockResolvedValue({ requests: [] });
    const { container } = wrap(<HomeSentNotesLine />);
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
    expect(container.textContent).toBe("");
  });
});

describe("Browse row", () => {
  it("offers quiet links instead of five cards", () => {
    wrap(<HomeBrowseRow />);
    const nav = screen.getByRole("navigation", { name: "Browse" });
    expect(nav.textContent).toContain("Or browse:");
    expect(screen.getByRole("link", { name: "Careers" }).getAttribute("href")).toBe("/intent/career");
    expect(screen.getByRole("link", { name: "Cities" }).getAttribute("href")).toBe("/intent/location");
    expect(screen.getByRole("link", { name: "All alumni" }).getAttribute("href")).toBe("/search");
    expect(screen.queryByText("Share with alumni")).toBeNull();
  });
});

describe("The Wall", () => {
  const zero = { careers: 0, hiring: 0, relocation: 0, startups: 0, guidance: 0, replies: 0 };
  it("stays on Home when empty, with no 'quiet' message and a way to post", () => {
    const onPost = vi.fn();
    wrap(
      <HomeOpportunityRail intentcasts={[]} activeCategory="all" onCategoryChange={() => {}} categoryCounts={zero} onPost={onPost} />,
    );
    expect(screen.getByRole("heading", { name: "The Wall" })).toBeTruthy();
    expect(screen.getByText("Ask for help, or share an opportunity, with every alum here.")).toBeTruthy();
    expect(screen.queryByText(/quiet out here/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Be the first to ask" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Post to The Wall" }));
    expect(onPost).toHaveBeenCalledTimes(1);
  });
});

describe("Small lines", () => {
  it("feedback is one line that opens the form in a new tab", () => {
    wrap(<HomeFeedbackSection />);
    const link = screen.getByRole("link", { name: /Tell us what you think/ });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.getByText(/Something missing or confusing\?/)).toBeTruthy();
  });
  it("top search says what it finds", () => {
    wrap(<HomeToolbarSearch searchText="" onSearchTextChange={() => {}} onSubmitSearch={() => {}} />);
    expect(screen.getByPlaceholderText("Search people, companies or cities")).toBeTruthy();
  });
});
