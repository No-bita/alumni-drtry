import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const postMock = vi.hoisted(() => vi.fn());
vi.mock("../src/api/client", () => ({
  api: { post: postMock },
}));
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({
    status: "authenticated",
    person: { personId: "p1", institutionalEmail: "a@iitbhu.ac.in" },
    myProfile: { fullName: "Sample Alum", departmentCode: "CSE", batchYear: 2020 },
  }),
}));

import { PostBulletinFlow, type PostBulletinFlowHandle } from "../src/components/PostBulletinFlow";
import { mapIntentcastToRow } from "../src/lib/careerFeedRow";

afterEach(cleanup);

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ref = createRef<PostBulletinFlowHandle>();
  render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <PostBulletinFlow ref={ref} />
      </QueryClientProvider>
    </MemoryRouter>
  );
  act(() => ref.current?.open({ careersPreset: "referralSeeking" }));
  return ref;
}

function fillApprovedForm() {
  fireEvent.change(screen.getByLabelText(/Job link/), { target: { value: "https://example.com/jobs/123" } });
  fireEvent.change(screen.getByLabelText(/^Role/), { target: { value: "Backend Engineer" } });
  fireEvent.change(screen.getByLabelText(/Company/), { target: { value: "Example Co" } });
  fireEvent.change(screen.getByLabelText(/Why are you a fit for this role/), {
    target: { value: "Three years building APIs on the same stack this team uses." },
  });
  fireEvent.change(screen.getByLabelText(/Resume link/), { target: { value: "https://example.com/cv.pdf" } });
}

describe("approved referral compose form", () => {
  it("shows the approved fields: required job link, role, company, fit; optional resume", () => {
    mount();
    expect(screen.getByLabelText(/Job link \*/)).toBeTruthy();
    expect(screen.getByLabelText(/^Role \*/)).toBeTruthy();
    expect(screen.getByLabelText(/Company \*/)).toBeTruthy();
    expect(screen.getByLabelText(/Why are you a fit for this role\? \*/)).toBeTruthy();
    expect(screen.getByLabelText(/Resume link \(optional\)/)).toBeTruthy();
    expect(screen.queryByLabelText(/About You/)).toBeNull();
  });

  it("keeps the fit answer budget independent of link length", () => {
    mount();
    const longUrl = `https://example.com/jobs/${"x".repeat(1500)}`;
    fireEvent.change(screen.getByLabelText(/Job link/), { target: { value: longUrl } });
    fireEvent.change(screen.getByLabelText(/Resume link/), { target: { value: longUrl } });
    const fit = screen.getByLabelText(/Why are you a fit for this role\? \*/);
    expect(fit.getAttribute("maxlength")).toBe("500");
  });

  it("requires the job link and validates it as a URL", () => {
    mount();
    fireEvent.change(screen.getByLabelText(/^Role/), { target: { value: "Backend Engineer" } });
    fireEvent.change(screen.getByLabelText(/Company/), { target: { value: "Example Co" } });
    fireEvent.change(screen.getByLabelText(/Why are you a fit/), { target: { value: "I match the stack." } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("alert").textContent).toContain("job link");
    fireEvent.change(screen.getByLabelText(/Job link/), { target: { value: "not a url !! " } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("alert").textContent).toContain("valid http(s) URL");
  });

  it("rejects links with an explicit non-http(s) scheme instead of prefixing them", () => {
    mount();
    fireEvent.change(screen.getByLabelText(/Job link/), { target: { value: "ftp://example.com/jobs/123" } });
    fireEvent.change(screen.getByLabelText(/^Role/), { target: { value: "Backend Engineer" } });
    fireEvent.change(screen.getByLabelText(/Company/), { target: { value: "Example Co" } });
    fireEvent.change(screen.getByLabelText(/Why are you a fit/), { target: { value: "I match the stack." } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("alert").textContent).toContain("valid http(s) URL");
    fireEvent.change(screen.getByLabelText(/Job link/), { target: { value: "example.com/jobs/123" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("requires company and the fit answer", () => {
    mount();
    fireEvent.change(screen.getByLabelText(/Job link/), { target: { value: "https://example.com/jobs/123" } });
    fireEvent.change(screen.getByLabelText(/^Role/), { target: { value: "Backend Engineer" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("alert").textContent).toContain("company");
    fireEvent.change(screen.getByLabelText(/Company/), { target: { value: "Example Co" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("alert").textContent).toContain("fit");
  });

  it("publishes the approved structure and the feed row contract renders the job link", async () => {
    postMock.mockResolvedValue({
      data: {
        intentcast: {
          id: "ic1",
          category: "mentorship",
          content: "",
          authorPersonId: "p1",
          authorFullName: "Sample Alum",
          createdAt: new Date().toISOString(),
        },
      },
    });
    mount();
    fillApprovedForm();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    });
    expect(postMock).toHaveBeenCalledOnce();
    const [path, payload] = postMock.mock.calls[0] as unknown as [
      string,
      { category: string; content: string; roleListingUrl: string | null; resumeListingUrl: string | null }
    ];
    expect(path).toBe("/v1/intentcasts");
    expect(payload.category).toBe("mentorship");
    // Links travel as structured fields, not packed "Role link:" lines in the content.
    expect(payload.roleListingUrl).toBe("https://example.com/jobs/123");
    expect(payload.resumeListingUrl).toBe("https://example.com/cv.pdf");
    expect(payload.content).toContain("Looking for referral for Backend Engineer at Example Co");
    expect(payload.content).toContain("Three years building APIs on the same stack this team uses.");
    expect(payload.content).not.toContain("Role link:");
    expect(payload.content).not.toContain("Resume link:");

    // Feed render contract: the stored fields yield a row with both links and clean prose.
    const stored = payload.content.replace(/^\s*\[\[cat:[a-z]+\]\]\s*\n?/i, "");
    const row = mapIntentcastToRow({
      id: "ic1",
      category: "mentorship",
      content: payload.content,
      roleListingUrl: payload.roleListingUrl,
      resumeListingUrl: payload.resumeListingUrl,
      authorPersonId: "p2",
      authorFullName: "Other Alum",
      authorDepartmentCode: "CSE",
      authorBatchYear: 2019,
      authorCurrentRoleTitle: null,
      authorCurrentOrganizationName: null,
      createdAt: new Date().toISOString(),
    } as never);
    expect(row).not.toBeNull();
    expect(row!.roleListingUrl).toBe("https://example.com/jobs/123");
    expect(row!.resumeListingUrl).toBe("https://example.com/cv.pdf");
    expect(row!.summary).toContain("Three years building APIs");
    expect(row!.summary).not.toContain("Role link:");
    expect(row!.summary).not.toContain("Resume link:");
    expect(stored.split("\n")[0]).toContain("Looking for referral");
  });
});
