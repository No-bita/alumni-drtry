import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { IntentcastService } from "../src/services/intentcastService.js";
import { IntentcastRepo } from "../src/repos/intentcastRepo.js";
import type { EmailSender } from "../src/services/emailSender.js";

const targetId = "22222222-2222-4222-8222-222222222222";
function setup(cityRows: unknown[] = [{ id: targetId, city_label: "Pune" }]) {
  vi.spyOn(IntentcastRepo.prototype, "loadAuthorAudienceFacts").mockResolvedValue({ institutionalEmail: "a@iitbhu.ac.in", isDemo: false, batchYear: 2020, departmentCode: "cse", departmentName: "Computer Science", departmentUnavailable: null, placeId: "11111111-1111-4111-8111-111111111111", placeName: "Bengaluru", placeUnavailable: null });
  const count = vi.spyOn(IntentcastRepo.prototype, "countAudience").mockResolvedValue(25);
  const query = vi.fn().mockResolvedValue({ rows: cityRows });
  const service = new IntentcastService({ query } as unknown as Pool, {} as EmailSender, 7);
  return { service, count, query };
}
afterEach(() => vi.restoreAllMocks());
describe("city-page audience", () => {
  it("uses the approved page city, not the author's residence, for preview and matching", async () => {
    const { service, count, query } = setup();
    expect(await service.previewAudience("author", { city: true, cityPlaceId: targetId })).toEqual({ everyone: false, label: "Pune", size: "about", approx: 20 });
    expect(count).toHaveBeenCalledWith("author", false, expect.objectContaining({ placeId: targetId }));
    expect(query).toHaveBeenCalledWith(expect.stringContaining("cp.status = 'approved'"), [targetId]);
    expect(query.mock.calls[0][0]).toContain("combined_into_place_id");
  });
  it("rejects unapproved or unknown cities instead of widening the audience", async () => {
    const { service, count } = setup([]);
    await expect(service.previewAudience("author", { city: true, cityPlaceId: targetId })).rejects.toMatchObject({ code: "AUDIENCE_BAD_REQUEST" });
    expect(count).not.toHaveBeenCalled();
  });
  it("keeps existing own-city and Everyone choices unchanged", async () => {
    const { service, count, query } = setup();
    expect(await service.previewAudience("author", null)).toEqual({ everyone: true, label: null, size: null });
    expect(await service.previewAudience("author", { city: true })).toMatchObject({ label: "Bengaluru" });
    expect(count).toHaveBeenCalledWith("author", false, expect.objectContaining({ placeId: "11111111-1111-4111-8111-111111111111" }));
    expect(query).not.toHaveBeenCalled();
  });
});
