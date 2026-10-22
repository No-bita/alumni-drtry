import { describe, expect, it } from "vitest";
import { IntentcastService } from "../src/services/intentcastService.js";

/**
 * Service-level coverage for PATCH /v1/intentcasts/:id structured listing URLs:
 * value sets, null clears, omitted leaves unchanged, invalid rejected, and the
 * 5-minute edit window is still enforced by the repo update path.
 */

const EXISTING = {
  id: "ic-1",
  author_person_id: "person-1",
  status: "open",
  author_soft_deleted_at: null
};

function makeService(repoBehavior: { updateReturnsNull?: boolean } = {}) {
  const service = new IntentcastService({} as never, {} as never, 30);
  const calls: { updateInput?: Record<string, unknown> } = {};
  const fakeRepo = {
    expireOpenIntentcasts: async () => 0,
    purgeAuthorSoftDeletedIntentcasts: async () => 0,
    findById: async () => EXISTING,
    updateWithinEditWindow: async (input: Record<string, unknown>) => {
      calls.updateInput = input;
      return repoBehavior.updateReturnsNull ? null : { id: "ic-1" };
    },
    findFeedItemById: async () => ({ id: "ic-1" })
  };
  (service as unknown as { intentcastRepo: unknown }).intentcastRepo = fakeRepo;
  return { service, calls };
}

describe("updateIntentcast structured listing URLs", () => {
  it("passes a normalized role link value through to the repo", async () => {
    const { service, calls } = makeService();
    await service.updateIntentcast("person-1", "ic-1", {
      roleListingUrl: "example.com/jobs/1"
    });
    expect(calls.updateInput?.roleListingUrl).toBe("https://example.com/jobs/1");
  });

  it("passes null through to clear a link", async () => {
    const { service, calls } = makeService();
    await service.updateIntentcast("person-1", "ic-1", {
      roleListingUrl: "https://example.com/jobs/1",
      resumeListingUrl: null
    });
    expect(calls.updateInput?.resumeListingUrl).toBeNull();
  });

  it("leaves omitted fields undefined so the repo does not touch them", async () => {
    const { service, calls } = makeService();
    await service.updateIntentcast("person-1", "ic-1", { content: "A long enough edit body" });
    // Repo updateWithinEditWindow only writes columns whose value is not undefined.
    expect(calls.updateInput?.roleListingUrl).toBeUndefined();
    expect(calls.updateInput?.resumeListingUrl).toBeUndefined();
  });

  it("rejects scheme-prefixed non-web links on update", async () => {
    const { service, calls } = makeService();
    await expect(
      service.updateIntentcast("person-1", "ic-1", { roleListingUrl: "mailto:user@example.com" })
    ).rejects.toMatchObject({ code: "INTENTCAST_LISTING_URL_INVALID" });
    expect(calls.updateInput).toBeUndefined();
  });

  it("still enforces the edit window via the repo update", async () => {
    const { service } = makeService({ updateReturnsNull: true });
    await expect(
      service.updateIntentcast("person-1", "ic-1", { roleListingUrl: "https://example.com/jobs/1" })
    ).rejects.toMatchObject({ statusCode: 409, code: "INTENTCAST_EDIT_WINDOW_EXPIRED" });
  });
});
