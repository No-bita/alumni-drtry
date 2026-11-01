import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { IntentcastFeedItem } from "../src/api/client";
import { HomeOpportunityRail } from "../src/components/HomeOpportunityRail";

vi.mock("../src/components/CareerIntentFeedRows", () => ({
  IntentcastActivityRowsList: ({ rows }: { rows: Array<{ roleHeader: string }> }) => <div>{rows.map((row) => <p key={row.roleHeader}>{row.roleHeader}</p>)}</div>,
}));

describe("Wall feed scope tabs", () => {
  it("keeps the same feed in both tabs and supports keyboard selection", () => {
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
          activeCategory="all"
          onCategoryChange={onCategoryChange}
          categoryCounts={{ careers: 1, hiring: 0, relocation: 0, startups: 0, guidance: 0, replies: 0 }}
        />
      </QueryClientProvider></MemoryRouter>,
    );
    const topics = screen.getByText("Topics");
    const details = topics.closest("details");
    details?.setAttribute("open", "");
    fireEvent.click(screen.getByRole("button", { name: /^Careers\s*1$/ }));
    expect(onCategoryChange).toHaveBeenCalledWith("careers");
    expect(details?.hasAttribute("open")).toBe(false);
    expect(document.activeElement).toBe(topics);
    const all = screen.getByRole("tab", { name: "All posts" });
    const personal = screen.getByRole("tab", { name: "For you" });
    const originalPanel = screen.getByRole("tabpanel");
    expect(all.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Test project")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Replies/ })).toBeNull();
    const initialContent = originalPanel.innerHTML;
    fireEvent.click(personal);
    expect(personal.getAttribute("aria-selected")).toBe("true");
    expect(all.getAttribute("tabindex")).toBe("-1");
    expect(screen.getByRole("tabpanel").innerHTML).toBe(initialContent);
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(personal.id);
    fireEvent.keyDown(personal, { key: "Home" });
    expect(all.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(all);
    fireEvent.keyDown(all, { key: "ArrowRight" });
    expect(personal.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(personal);
    expect(screen.getByRole("tabpanel").innerHTML).toBe(initialContent);
  });
});
