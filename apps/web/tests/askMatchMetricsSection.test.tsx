import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiGet = vi.hoisted(() => vi.fn());
vi.mock("../src/api/client", () => ({ api: { get: apiGet } }));

import { AskMatchMetricsSection } from "../src/components/AskMatchMetricsSection";

afterEach(cleanup);

const row = (category: string | null, q: number, m: number, n: number, a: number) => ({
  category, questions: q, needsDetail: 0, withMatches: m, notesSent: n, notesAccepted: a, notesDeclined: 0, notesPending: n - a, medianReplyDays: 1.5,
});

describe("AskMatchMetricsSection", () => {
  it("renders funnel, categories and completeness with percentages", async () => {
    apiGet.mockResolvedValue({
      data: {
        metrics: {
          windowDays: 30,
          total: { ...row(null, 40, 30, 10, 6), needsDetail: 4 },
          byCategory: [row("referral", 25, 20, 8, 5), row(null, 3, 1, 0, 0)],
          remindersSent: 2,
          profiles: { members: 200, withCurrentRole: 150, withPastRole: 40, withOpenTo: 50, withBio: 90, withCity: 160 },
        },
      },
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AskMatchMetricsSection />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Ask → Match funnel (last 30 days)")).toBeTruthy();
    expect(screen.getByText("30 (75%)")).toBeTruthy();
    expect(screen.getByText("6 (60%)")).toBeTruthy();
    expect(screen.getByText("Referral")).toBeTruthy();
    expect(screen.getByText("25 → 20 → 8 → 5")).toBeTruthy();
    expect(screen.getByText("No clear category")).toBeTruthy();
    expect(screen.getByText("50 (25%)")).toBeTruthy();
    expect(apiGet).toHaveBeenCalledWith("/v1/admin/metrics/ask-match");
  });
});
