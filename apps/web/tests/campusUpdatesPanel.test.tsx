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
    await waitFor(() => expect(screen.getByText(/still being printed/)).toBeTruthy());
    expect(screen.queryByText(/out now/i)).toBeNull();
  });
});
