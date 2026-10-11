import { afterEach, describe, expect, it, vi } from "vitest";
import { NETWORK_ERROR_MESSAGE, apiPostForm } from "../src/api/client";

describe("network failure message", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is user-safe and does not leak deployment details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const result = await apiPostForm("/v1/anything", new FormData());
    expect(result.error?.code).toBe("NETWORK_ERROR");
    expect(result.error?.message).toBe(NETWORK_ERROR_MESSAGE);
    expect(NETWORK_ERROR_MESSAGE).not.toMatch(/4000|VITE_API_URL|Vercel|rewrite|CORS|apps\/api/i);
  });
});
