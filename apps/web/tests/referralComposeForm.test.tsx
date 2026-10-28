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
  fireEvent.change(screen.getByLabelText(/Point 1/), {
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
    expect(screen.getByLabelText(/Point 1 \*/)).toBeTruthy();
    expect(screen.getByLabelText(/Point 2/)).toBeTruthy();
    expect(screen.getByLabelText(/Point 3/)).toBeTruthy();
    expect(screen.getByRole("heading", {name:"Ask for a referral"})).toBeTruthy();
    expect(screen.getByLabelText(/Resume link/)).toBeTruthy();
    expect(screen.queryByLabelText(/About You/)).toBeNull();
  });

  it("requires the job link and validates it as a URL", () => {
    mount();
    fireEvent.change(screen.getByLabelText(/^Role/), { target: { value: "Backend Engineer" } });
    fireEvent.change(screen.getByLabelText(/Company/), { target: { value: "Example Co" } });
    fireEvent.change(screen.getByLabelText(/Point 1/), { target: { value: "I match the stack." } });
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
    fireEvent.change(screen.getByLabelText(/Point 1/), { target: { value: "I match the stack." } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("alert").textContent).toContain("valid http(s) URL");
    fireEvent.change(screen.getByLabelText(/Job link/), { target: { value: "mailto:user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("alert").textContent).toContain("valid http(s) URL");
    fireEvent.change(screen.getByLabelText(/Job link/), { target: { value: "example.com/jobs/123" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("rejects scheme-like input with a numeric tail that is not a host", () => {
    mount();
    fireEvent.change(screen.getByLabelText(/Job link/), { target: { value: "ftp:21/download" } });
    fireEvent.change(screen.getByLabelText(/^Role/), { target: { value: "Backend Engineer" } });
    fireEvent.change(screen.getByLabelText(/Company/), { target: { value: "Example Co" } });
    fireEvent.change(screen.getByLabelText(/Point 1/), { target: { value: "I match the stack." } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("still accepts host:port input while rejecting scheme-prefixed non-web links", () => {
    mount();
    fireEvent.change(screen.getByLabelText(/Job link/), { target: { value: "example.com:8080/jobs/123" } });
    fireEvent.change(screen.getByLabelText(/^Role/), { target: { value: "Backend Engineer" } });
    fireEvent.change(screen.getByLabelText(/Company/), { target: { value: "Example Co" } });
    fireEvent.change(screen.getByLabelText(/Point 1/), { target: { value: "I match the stack." } });
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
    expect(screen.getByRole("alert").textContent).toContain("point 1");
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
    const [path, payload] = postMock.mock.calls[0] as unknown as [string, { category: string; content: string }];
    expect(path).toBe("/v1/intentcasts");
    expect(payload.category).toBe("mentorship");
    expect(payload.content).toContain("Looking for referral for Backend Engineer at Example Co");
    expect(payload.content).toContain("Role link: https://example.com/jobs/123");
    expect(payload.content).toContain("Resume link: https://example.com/cv.pdf");
    expect(payload.content).toContain("Three years building APIs on the same stack this team uses.");

    // Feed render contract: the same stored content yields a row with both links and clean prose.
    const stored = payload.content.replace(/^\s*\[\[cat:[a-z]+\]\]\s*\n?/i, "");
    const row = mapIntentcastToRow({
      id: "ic1",
      category: "mentorship",
      content: payload.content,
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
  it("keeps only the first point required and keeps preview without numbered steps", () => {
    mount();
    expect(screen.queryByLabelText("Referral ask steps")).toBeNull();
    fireEvent.change(screen.getByLabelText(/Job link/), {target:{value:"https://example.com/job"}});
    fireEvent.change(screen.getByLabelText(/^Role/), {target:{value:"Engineer"}});
    fireEvent.change(screen.getByLabelText(/Company/), {target:{value:"Example Co"}});
    fireEvent.click(screen.getByRole("button",{name:"Preview"}));
    expect(screen.getByRole("alert").textContent).toContain("point 1");
    fireEvent.change(screen.getByLabelText(/Point 1/), {target:{value:"2 years experience in backend systems"}});
    fireEvent.click(screen.getByRole("button",{name:"Preview"}));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button",{name:"Publish"})).toBeTruthy();
  });

  it("preserves numeric experience phrasing and point boundaries through real feed derivation", () => {
    const summary = "2 years experience in backend systems\nBuilt a payments integration\nEx-CRED, payments infra";
    const row = mapIntentcastToRow({id:"preserve",category:"mentorship",content:`[[cat:careers]]\nLooking for referral for Engineer at Example Co\n${summary}\n\nRole link: https://example.com/job\n\nResume link: https://example.com/cv`,authorPersonId:"p2",authorFullName:"Sample",authorDepartmentCode:"CSE",authorBatchYear:2020,createdAt:"2026-10-24T07:00:00Z"} as never);
    expect(row!.summary).toBe(summary);
    expect(row!.roleListingUrl).toBe("https://example.com/job");
    expect(row!.resumeListingUrl).toBe("https://example.com/cv");
  });

});
