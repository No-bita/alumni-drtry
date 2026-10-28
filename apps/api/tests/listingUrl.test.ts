import { describe, expect, it } from "vitest";
import { tryNormalizeListingUrl } from "../src/lib/listingUrl.js";

describe("tryNormalizeListingUrl", () => {
  it("accepts absolute http(s) URLs", () => {
    expect(tryNormalizeListingUrl("https://example.com/jobs/123")).toBe("https://example.com/jobs/123");
    expect(tryNormalizeListingUrl("http://example.com/x")).toBe("http://example.com/x");
  });

  it("prefixes bare host/path input with https://", () => {
    expect(tryNormalizeListingUrl("example.com/jobs/123")).toBe("https://example.com/jobs/123");
  });

  it("rejects explicit non-http(s) schemes instead of prefixing them", () => {
    expect(tryNormalizeListingUrl("ftp://example.com/jobs")).toBeNull();
    expect(tryNormalizeListingUrl("javascript:alert(1)//x")).toBeNull();
  });

  it("rejects scheme-prefixed non-web links without //", () => {
    expect(tryNormalizeListingUrl("mailto:user@example.com")).toBeNull();
    expect(tryNormalizeListingUrl("tel:+919999999999")).toBeNull();
  });

  it("still accepts host:port input", () => {
    expect(tryNormalizeListingUrl("example.com:8080/jobs/123")).toBe("https://example.com:8080/jobs/123");
  });

  it("rejects scheme-like input with a numeric tail that is not a host", () => {
    expect(tryNormalizeListingUrl("ftp:21/download")).toBeNull();
  });

  it("rejects blank and non-URL input", () => {
    expect(tryNormalizeListingUrl("")).toBeNull();
    expect(tryNormalizeListingUrl("   ")).toBeNull();
    expect(tryNormalizeListingUrl("not a url !!")).toBeNull();
  });
});
