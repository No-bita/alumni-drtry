import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiGet = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: apiGet }));

import { AdminBrowsingLimits } from "../src/components/AdminBrowsingLimits";
import { ApiRequestError } from "../src/lib/apiRequestError";
import { browsingLimitFromError, browsingLimitMessage } from "../src/lib/browsingLimits";
import { MatchRequestError, matchErrorMessage } from "../src/lib/matchApi";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("browsing limits", () => {
  it("turns limit codes into the member-facing message; other errors stay generic", () => {
    expect(browsingLimitFromError(new ApiRequestError("DISCOVERY_DAILY_LIMIT", "Server words.", 429))).toBe("Server words.");
    expect(browsingLimitMessage("DISCOVERY_DAILY_LIMIT", "")).toBe("You've looked at a lot of profiles today. Try again tomorrow.");
    expect(browsingLimitMessage("DISCOVERY_RATE_LIMITED", null)).toBe("You're browsing quickly. Try again in a moment.");
    expect(browsingLimitFromError(new ApiRequestError("PROFILE_NOT_FOUND", "nope", 404))).toBeNull();
    expect(browsingLimitFromError(new Error("down"))).toBeNull();
    expect(
      matchErrorMessage(new MatchRequestError({ code: "DISCOVERY_DAILY_LIMIT", message: "You've looked at a lot of profiles today. Try again tomorrow." })),
    ).toBe("You've looked at a lot of profiles today. Try again tomorrow.");
  });

  it("admin tile: members near today's limit and at it, counts only", async () => {
    apiGet.mockResolvedValue({ limits: { cap: 500, nearLimit: 3, atLimit: 1, day: "2026-11-06" } });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AdminBrowsingLimits />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Members near today's browsing limit (≥80%)")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText(/up to 500 profiles, searches and people lists a day/)).toBeTruthy();
    expect(apiGet).toHaveBeenCalledWith("/v1/admin/metrics/discovery-limits", expect.anything());
  });
});
