import { describe, expect, it } from "vitest";
import { decodeSearchCursor, encodeSearchCursor } from "../src/services/discoveryService.js";

describe("search cursor v3 codec", () => {
  it("roundtrips tier + completeness + pca + id (v3 payload)", () => {
    const original = {
      tier: 1,
      completeness: 775,
      profileCompletedAtMs: 1_704_000_000_000,
      id: "aaaaaaaa-bbbb-4ccc-8eee-eeeeeeeeeeee"
    };
    const encoded = encodeSearchCursor(original);
    const decoded = decodeSearchCursor(encoded);
    expect(decoded).toMatchObject(original);
    expect(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")).v).toBe(3);
  });

  it("roundtrips batch widening flag", () => {
    const original = {
      tier: 0,
      completeness: 400,
      profileCompletedAtMs: null,
      id: "11111111-2222-4333-8444-555555555555",
      batchWidened: true as const
    };
    expect(decodeSearchCursor(encodeSearchCursor(original))).toEqual(original);
  });

  it("roundtrips null profile_completed_at", () => {
    const original = {
      tier: 2,
      completeness: 100,
      profileCompletedAtMs: null,
      id: "11111111-2222-4333-8444-555555555555"
    };
    expect(decodeSearchCursor(encodeSearchCursor(original))).toMatchObject(original);
  });

  it("decodes v2 cursor without widening", () => {
    const v2 = Buffer.from(
      JSON.stringify({
        v: 2,
        t: 1,
        c: 5,
        pca: null,
        id: "aaaaaaaa-bbbb-4ccc-8eee-eeeeeeeeeeee"
      }),
      "utf8"
    ).toString("base64url");
    expect(decodeSearchCursor(v2)).toMatchObject({
      tier: 1,
      completeness: 5,
      profileCompletedAtMs: null,
      id: "aaaaaaaa-bbbb-4ccc-8eee-eeeeeeeeeeee"
    });
  });

  it("rejects legacy name-based cursor", () => {
    const legacy = Buffer.from(JSON.stringify({ name: "foo", id: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee" }), "utf8").toString(
      "base64url"
    );
    expect(() => decodeSearchCursor(legacy)).toThrowError();
  });
});
