import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HomeCampusUpdatesPanel } from "../src/components/HomeCampusUpdatesPanel";

vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: vi.fn() }));
import { assertApiGet } from "../src/lib/assertApiGet";

afterEach(cleanup);
function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><HomeCampusUpdatesPanel /></QueryClientProvider>);
}

describe("Campus Updates panel", () => {
  it("shows the real issue label and no fake size or archive link", async () => {
    vi.mocked(assertApiGet).mockResolvedValue({ issue: { issueMonth: "2026-10", headingLabel: "Alma Communique - Oct 2026" } });
    wrap();
    await waitFor(() => expect(screen.getByText("Alma Communique - Oct 2026")).toBeTruthy());
    expect(screen.queryByText(/4\.2 MB/)).toBeNull();
    expect(screen.queryByText(/past editions/i)).toBeNull();
    expect(screen.getByText(/Hot off the press/)).toBeTruthy();
  });
  it("is honest when there is no current issue", async () => {
    vi.mocked(assertApiGet).mockResolvedValue({ issue: null });
    wrap();
    await waitFor(() => expect(screen.getByText(/No current edition is available/)).toBeTruthy());
    expect(screen.queryByText(/out now/i)).toBeNull();
  });
  it("does not claim a missing issue while still loading", async () => {
    vi.mocked(assertApiGet).mockReturnValue(new Promise(() => {}));
    wrap();
    expect(screen.getByText(/Checking for the newest edition/)).toBeTruthy();
    expect(screen.queryByText(/No current edition is available/)).toBeNull();
  });
  it("does not claim a missing issue when the request fails", async () => {
    vi.mocked(assertApiGet).mockRejectedValue(new Error("down"));
    wrap();
    await waitFor(() => expect(screen.getByText(/couldn't check for a newer edition/)).toBeTruthy());
    expect(screen.queryByText(/No current edition is available/)).toBeNull();
  });
});
