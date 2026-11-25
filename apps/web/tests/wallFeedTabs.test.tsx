import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { IntentcastFeedItem } from "../src/api/client";
import { HomeOpportunityRail } from "../src/components/HomeOpportunityRail";

vi.mock("../src/components/CareerIntentFeedRows", () => ({
  IntentcastActivityRowsList: ({ rows }: { rows: Array<{ roleHeader: string }> }) => <div>{rows.map((row) => <p key={row.roleHeader}>{row.roleHeader}</p>)}</div>,
}));

afterEach(cleanup);

describe("Wall feed without tabs", () => {
  it("shows the existing all-posts feed without any tab controls", () => {
    const onCategoryChange = vi.fn();
    render(
      <MemoryRouter><QueryClientProvider client={new QueryClient()}>
        <HomeOpportunityRail
          intentcasts={[{
            id: "test-post", authorPersonId: "test-author", authorFullName: "Test Author",
            authorDepartmentCode: "CSE", authorDepartmentName: "Computer Science",
            category: "collaboration", content: "[[cat:startups]]\nTest project\nDetails for the project.",
            status: "active", expiresAt: "2026-12-01T00:00:00Z", closedAt: null,
            createdAt: "2026-11-01T00:00:00Z", editableUntil: "2026-11-02T00:00:00Z",
            responseCount: 0, viewerHasResponded: false,
          } satisfies IntentcastFeedItem]}
          onPost={() => {}}
          activeCategory="all"
          onCategoryChange={onCategoryChange}
          categoryCounts={{ careers: 1, hiring: 0, relocation: 0, startups: 0, guidance: 0, replies: 0 }}
        />
      </QueryClientProvider></MemoryRouter>,
    );
    // PARKED 2026-11-18: topic chips are parked (see HomeOpportunityRail); the Topics
    // trigger no longer renders. Restore this block with the chips.
    // const topics = screen.getByRole("button", { name: /Topics/ });
    // const tablist0 = screen.getByRole("tablist", { name: "Wall feeds" });
    // expect(tablist0.contains(topics)).toBe(false);
    // expect(topics.parentElement?.parentElement).toBe(tablist0.parentElement);
    // fireEvent.click(topics);
    // expect(topics.getAttribute("aria-expanded")).toBe("true");
    // fireEvent.click(screen.getByRole("button", { name: /^Careers\s*1$/ }));
    // expect(onCategoryChange).toHaveBeenCalledWith("careers");
    // expect(topics.getAttribute("aria-expanded")).toBe("false");
    // expect(document.activeElement).toBe(topics);
    expect(screen.queryByRole("button", { name: /Topics/ })).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("tabpanel")).toBeNull();
    expect(screen.queryByText("For you")).toBeNull();
    expect(screen.getByText("Test project")).toBeTruthy();
    expect(onCategoryChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Post", exact: true })).toBeNull();
  });
  // PARKED 2026-11-18: topic chips are parked (see HomeOpportunityRail), so this
  // interaction test is parked with them. Restore together.
  // it("preserves selected-topic toggle-off, zero-count categories and summary focus", () => {
  //   const onCategoryChange = vi.fn();
  //   render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>
  //     <HomeOpportunityRail intentcasts={[]} activeCategory="careers" onCategoryChange={onCategoryChange}
  //       categoryCounts={{ careers: 1, hiring: 0, relocation: 0, startups: 0, guidance: 0, replies: 0 }} />
  //   </MemoryRouter></QueryClientProvider>);
  //   const trigger = screen.getByRole("button", { name: /Topics/ });
  //   fireEvent.click(trigger);
  //   const careers = screen.getByRole("button", { name: /^Careers\s*1$/ });
  //   expect(careers.getAttribute("aria-pressed")).toBe("true");
  //   expect(screen.getByRole("button", { name: /^Relocation\s*0$/ })).toBeTruthy();
  //   fireEvent.click(careers);
  //   expect(onCategoryChange).toHaveBeenCalledWith("all");
  //   expect(trigger.getAttribute("aria-expanded")).toBe("false");
  //   expect(document.activeElement).toBe(trigger);
  // });
  it("keeps Topics absent for a fully empty feed", () => {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>
      <HomeOpportunityRail intentcasts={[]} activeCategory="all" onCategoryChange={() => {}}
        categoryCounts={{ careers: 0, hiring: 0, relocation: 0, startups: 0, guidance: 0, replies: 0 }} />
    </MemoryRouter></QueryClientProvider>);
    expect(screen.queryByText("Topics")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });

});
