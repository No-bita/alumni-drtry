import { beforeEach, describe, expect, it, vi } from "vitest";

const apiPost = vi.hoisted(() => vi.fn());
vi.mock("../src/api/client", () => ({ api: { post: apiPost, get: vi.fn() } }));

import { AdminDepartmentOtherError, approveSubmission, linkSubmission, rejectSubmission, reviewErrorMessage } from "../src/lib/adminDepartmentOther";

describe("approving an Other department", () => {
  beforeEach(() => apiPost.mockReset());

  it("sends the exact text the admin reviewed", async () => {
    apiPost.mockResolvedValue({ data: null, error: undefined });
    await approveSubmission("p1", "Astrophysics");
    expect(apiPost).toHaveBeenCalledWith("/v1/admin/department-other/p1/approve", { expectedText: "Astrophysics" });
  });

  it("a changed-text conflict is surfaced and refreshes the list", async () => {
    apiPost.mockResolvedValue({ data: null, error: { code: "DEPARTMENT_OTHER_CHANGED", message: "x" } });
    const err = await approveSubmission("p1", "Old").catch((e) => e);
    expect(err).toBeInstanceOf(AdminDepartmentOtherError);
    const m = reviewErrorMessage(err);
    expect(m.refresh).toBe(true);
    expect(m.message).toMatch(/changed/i);
  });

  it("reject and link also send the exact reviewed text", async () => {
    apiPost.mockResolvedValue({ data: null, error: undefined });
    await rejectSubmission("p1", "Not real", "Astro");
    await linkSubmission("p1", "d1", "Astro");
    expect(apiPost).toHaveBeenCalledWith("/v1/admin/department-other/p1/reject", { reason: "Not real", expectedText: "Astro" });
    expect(apiPost).toHaveBeenCalledWith("/v1/admin/department-other/p1/link", { departmentId: "d1", expectedText: "Astro" });
  });
});
