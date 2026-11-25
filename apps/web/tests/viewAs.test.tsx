import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  api,
  apiPostForm,
  isViewAsReadOnly,
  setViewAsReadOnly,
  VIEW_AS_READ_ONLY_CODE,
  type ViewAsInfo,
} from "../src/api/client";
import { fetchAuthSession } from "../src/lib/authSessionQuery";
import { viewAsName } from "../src/lib/viewAs";

const fns = vi.hoisted(() => ({
  searchViewAsPeople: vi.fn(),
  startViewAs: vi.fn(),
  endViewAs: vi.fn(),
  reloadAppAt: vi.fn(),
}));
vi.mock("../src/lib/viewAs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/viewAs")>();
  return { ...actual, ...fns };
});
const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));

import { ViewAsBanner } from "../src/components/ViewAsBanner";
import { AdminViewAsPage } from "../src/pages/AdminViewAsPage";

const info: ViewAsInfo = {
  sessionId: "s-1",
  adminPersonId: "admin-1",
  targetPersonId: "m-1",
  targetName: "Priya Sharma",
  targetEmail: "priya@iitbhu.ac.in",
  expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  readOnly: true,
};

const okJson = (body: unknown) =>
  ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as unknown as Response;

beforeEach(() => {
  setViewAsReadOnly(false);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setViewAsReadOnly(false);
});

describe("API client while viewing as a member", () => {
  it("sends no writes except ending view-as; reads still go out", async () => {
    const fetchMock = vi.fn(async () => okJson({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    setViewAsReadOnly(true);

    for (const call of [
      () => api.post("/v1/notifications/mark-all-seen", {}),
      () => api.patch("/v1/me/profile", { fullName: "x" }),
      () => api.put("/v1/admin/settings/broker-whatsapp", { enabled: true }),
      () => api.delete("/v1/me/links/1"),
      () => api.post("/v1/auth/logout"),
      () => apiPostForm("/v1/campus-monthly", new FormData()),
    ]) {
      const res = await call();
      expect(res.error?.code).toBe(VIEW_AS_READ_ONLY_CODE);
    }
    expect(fetchMock).not.toHaveBeenCalled();

    await api.get("/v1/me");
    await api.post("/v1/admin/view-as/end");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("writes go out normally when not viewing as anyone", async () => {
    const fetchMock = vi.fn(async () => okJson({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await api.post("/v1/notifications/mark-all-seen", {});
    expect(res.error).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("the session snapshot turns read-only on and off from GET /v1/me", async () => {
    const me = { person: { personId: "m-1", institutionalEmail: "priya@iitbhu.ac.in", role: "alumni" }, viewAs: info, canViewAs: true };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => okJson(String(url).includes("/v1/me/profile") ? { profile: { id: "m-1", fullName: "Priya Sharma" } } : me)),
    );
    const on = await fetchAuthSession(new AbortController().signal);
    expect(on).toMatchObject({ kind: "authenticated", viewAs: info, canViewAs: true });
    expect(isViewAsReadOnly()).toBe(true);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        okJson(String(url).includes("/v1/me/profile") ? { profile: { id: "a-1" } } : { ...me, viewAs: null, person: { ...me.person, personId: "a-1" } }),
      ),
    );
    const off = await fetchAuthSession(new AbortController().signal);
    expect(off).toMatchObject({ kind: "authenticated", viewAs: null });
    expect(isViewAsReadOnly()).toBe(false);
  });
});

describe("View-as banner", () => {
  const mountBanner = () =>
    render(
      <MemoryRouter>
        <ViewAsBanner />
      </MemoryRouter>,
    );

  it("is not shown without an active view-as", () => {
    authState.value = { status: "authenticated", person: { personId: "a-1", role: "admin" }, myProfile: null, viewAs: null };
    mountBanner();
    expect(screen.queryByRole("region", { name: "Viewing as a member" })).toBeNull();
    expect(document.documentElement.dataset.viewAs).toBeUndefined();
  });

  it("says who and read-only, reserves space, and Exit ends view-as and reloads into the admin page", async () => {
    authState.value = { status: "authenticated", person: { personId: "m-1", role: "alumni" }, myProfile: null, viewAs: info };
    fns.endViewAs.mockResolvedValue(undefined);
    mountBanner();
    const banner = screen.getByRole("region", { name: "Viewing as a member" });
    expect(banner.textContent).toContain("Viewing as Priya Sharma — read-only.");
    expect(document.documentElement.dataset.viewAs).toBe("on");
    expect(document.title).toContain("[Viewing as Priya Sharma]");
    fireEvent.click(screen.getByRole("button", { name: "Exit" }));
    await waitFor(() => expect(fns.reloadAppAt).toHaveBeenCalledWith("/admin/view-as?ended=1"));
    expect(fns.endViewAs).toHaveBeenCalledTimes(1);
    cleanup();
    expect(document.documentElement.dataset.viewAs).toBeUndefined();
  });

  it("falls back to the email when the member has no name, and leaves at expiry", async () => {
    vi.useFakeTimers();
    try {
      authState.value = {
        status: "authenticated",
        person: { personId: "m-1", role: "alumni" },
        myProfile: null,
        viewAs: { ...info, targetName: null, expiresAt: new Date(Date.now() + 5_000).toISOString() },
      };
      mountBanner();
      expect(screen.getByRole("region", { name: "Viewing as a member" }).textContent).toContain("priya@iitbhu.ac.in");
      expect(fns.reloadAppAt).not.toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(7_000);
      });
      expect(fns.reloadAppAt).toHaveBeenCalledWith("/admin/view-as?ended=expired");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows an error and stays when exiting fails", async () => {
    const { ViewAsError } = await import("../src/lib/viewAs");
    authState.value = { status: "authenticated", person: { personId: "m-1", role: "alumni" }, myProfile: null, viewAs: info };
    fns.endViewAs.mockRejectedValue(new ViewAsError("UNKNOWN", "Couldn't exit view-as. Try again."));
    mountBanner();
    fireEvent.click(screen.getByRole("button", { name: "Exit" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't exit view-as. Try again.");
    expect(fns.reloadAppAt).not.toHaveBeenCalled();
  });
});

describe("Admin view-as page", () => {
  const mountPage = (path = "/admin/view-as") =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[path]}>
          <AdminViewAsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

  it("is hidden from admins who are not allowlisted, and from members", () => {
    authState.value = { status: "authenticated", person: { personId: "a-2", role: "admin" }, myProfile: null, canViewAs: false };
    mountPage();
    expect(screen.getByRole("alert").textContent).toBe("This page is for admins.");
    expect(screen.queryByLabelText("Name or email")).toBeNull();
    cleanup();
    authState.value = { status: "authenticated", person: { personId: "m-1", role: "alumni" }, myProfile: null };
    mountPage();
    expect(screen.queryByLabelText("Name or email")).toBeNull();
    expect(fns.searchViewAsPeople).not.toHaveBeenCalled();
  });

  it("searches members and starts view-as, then reloads into the member's Home", async () => {
    authState.value = { status: "authenticated", person: { personId: "a-1", role: "admin" }, myProfile: { fullName: "Owner" }, canViewAs: true };
    fns.searchViewAsPeople.mockResolvedValue([
      { personId: "m-1", fullName: "Priya Sharma", institutionalEmail: "priya@iitbhu.ac.in", batchYear: 2019, departmentCode: "cse", role: "alumni", suspended: false },
    ]);
    fns.startViewAs.mockResolvedValue(info);
    mountPage();
    fireEvent.change(screen.getByLabelText("Name or email"), { target: { value: "priya" } });
    const btn = await screen.findByRole("button", { name: "View as Priya Sharma" });
    expect(fns.searchViewAsPeople).toHaveBeenCalledWith("priya", expect.anything());
    expect(screen.getByText("priya@iitbhu.ac.in · ’19 · CSE")).toBeTruthy();
    fireEvent.click(btn);
    await waitFor(() => expect(fns.reloadAppAt).toHaveBeenCalledWith("/home"));
    expect(fns.startViewAs).toHaveBeenCalledWith("m-1");
  });

  it("shows the API's refusal instead of starting", async () => {
    const { ViewAsError } = await import("../src/lib/viewAs");
    authState.value = { status: "authenticated", person: { personId: "a-1", role: "admin" }, myProfile: null, canViewAs: true };
    fns.searchViewAsPeople.mockResolvedValue([
      { personId: "m-1", fullName: "Priya Sharma", institutionalEmail: "priya@iitbhu.ac.in", batchYear: null, departmentCode: null, role: "alumni", suspended: false },
    ]);
    fns.startViewAs.mockRejectedValue(new ViewAsError("VIEW_AS_FORBIDDEN", "View as member isn't enabled for your account."));
    mountPage();
    fireEvent.change(screen.getByLabelText("Name or email"), { target: { value: "priya" } });
    fireEvent.click(await screen.findByRole("button", { name: "View as Priya Sharma" }));
    expect((await screen.findByRole("alert")).textContent).toBe("View as member isn't enabled for your account.");
    expect(fns.reloadAppAt).not.toHaveBeenCalled();
  });

  it("says when view-as ended, and points to Exit while one is active", () => {
    authState.value = { status: "authenticated", person: { personId: "a-1", role: "admin" }, myProfile: null, canViewAs: true };
    mountPage("/admin/view-as?ended=expired");
    expect(screen.getByText(/View-as ended after its time limit/)).toBeTruthy();
    cleanup();
    authState.value = { status: "authenticated", person: { personId: "m-1", role: "alumni" }, myProfile: null, canViewAs: true, viewAs: info };
    mountPage();
    expect(screen.getByRole("status").textContent).toContain(`You're viewing as ${viewAsName(info)}`);
    expect(screen.queryByLabelText("Name or email")).toBeNull();
  });
});
