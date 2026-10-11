import { QueryClient, QueryObserver, focusManager } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { queryClient as appClient } from "../src/queryClient";
import { THREAD_REFRESH_OPTIONS } from "../src/lib/threadRefresh";

function makeClient() {
  // same defaults as the app: focus refetch off, 30s stale
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: false } },
  });
}

describe("thread refresh", () => {
  it("never polls", () => {
    expect(THREAD_REFRESH_OPTIONS.refetchInterval).toBe(false);
    expect(appClient.getDefaultOptions().queries?.refetchInterval).toBeUndefined();
  });

  it("refetches on mount even when cached data is fresh, and on window focus", async () => {
    const qc = makeClient();
    qc.mount();
    const fn = vi.fn().mockResolvedValue({ n: 1 });
    const opts = { queryKey: ["t"], queryFn: fn, ...THREAD_REFRESH_OPTIONS };
    const first = new QueryObserver(qc, opts);
    const u1 = first.subscribe(() => {});
    await vi.waitFor(() => expect(first.getCurrentResult().isSuccess).toBe(true));
    u1();
    const second = new QueryObserver(qc, opts);
    const u2 = second.subscribe(() => {});
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(3));
    u2();
  });

  it("without the options, fresh data is NOT refetched on mount (the old behaviour)", async () => {
    const qc = makeClient();
    const fn = vi.fn().mockResolvedValue({ n: 1 });
    const opts = { queryKey: ["t"], queryFn: fn };
    const o1 = new QueryObserver(qc, opts);
    const u1 = o1.subscribe(() => {});
    await vi.waitFor(() => expect(o1.getCurrentResult().isSuccess).toBe(true));
    u1();
    const u2 = new QueryObserver(qc, opts).subscribe(() => {});
    await new Promise((r) => setTimeout(r, 50));
    expect(fn).toHaveBeenCalledTimes(1);
    u2();
  });
});
