import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HomeOpportunityRail } from "../src/components/HomeOpportunityRail";
import { IntentcastActivityRowsList, type CareerFeedRowModel } from "../src/components/CareerIntentFeedRows";
import { api, type IntentcastFeedItem } from "../src/api/client";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const row: CareerFeedRowModel = {
  id: "post-a", tone: "general", roleHeader: "Alumni welcome evening", companySubtitle: null,
  summary: "Join fellow alumni for an evening of conversation.", chips: [], kindLabel: "Invitation",
  employmentType: null, compensation: null, experience: null,
  authorPersonId: "author", authorFullName: "Riya Sharma", authorDepartmentCode: "CSE",
  authorBatchYear: 2016, authorRoleLine: "Engineer, Acme", postedRelative: "2h ago",
  postedAtIso: "2026-11-20T12:00:00Z", roleListingUrl: null, resumeListingUrl: null,
};
function wrap(node: React.ReactNode, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(<QueryClientProvider client={client}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>);
}
function rows(options: { admin?: boolean; own?: boolean; pinned?: boolean; busy?: boolean; outsideWall?: boolean } = {}) {
  const toggle = vi.fn();
  const del = vi.fn();
  wrap(<IntentcastActivityRowsList rows={[row]} viewerPersonId={options.own ? "author" : "viewer"}
    deleteSubmittingId={null} onRequestDelete={del}
    wallPins={options.outsideWall ? undefined : new Map(options.pinned ? [[row.id, "2026-11-20T13:00:00Z"]] : [])}
    onToggleWallPin={options.admin ? toggle : undefined} pinSubmitting={options.busy} />);
  return { toggle, del };
}
const item = { id: row.id, authorPersonId: "author", authorFullName: row.authorFullName,
  authorDepartmentCode: "CSE", authorBatchYear: 2016, authorRoleLine: null,
  content: "Alumni welcome evening\nJoin fellow alumni for an evening of conversation.", category: "guidance",
  createdAt: "2026-11-20T12:00:00Z", status: "open", responseCount: 0, wallPinnedAt: null } as IntentcastFeedItem;
function rail(client: QueryClient) {
  return wrap(<HomeOpportunityRail intentcasts={[item]} activeCategory="all" onCategoryChange={vi.fn()}
    categoryCounts={{ careers: 0, relocation: 0, startups: 0, guidance: 1, replies: 0 }}
    viewerPersonId="viewer" canManageWallPins />, client);
}

describe("Home Wall pins", () => {
  it("shows a text badge and pin icon to ordinary viewers, without a management menu", () => {
    rows({ pinned: true });
    expect(screen.getByText("Pinned").querySelector("svg")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Post actions" })).toBeNull();
  });
  it("never shows pin state on non-Wall rows", () => {
    rows({ outsideWall: true, pinned: true });
    expect(screen.queryByText("Pinned")).toBeNull();
  });
  it("lets an admin pin another author's post but does not grant delete", () => {
    const { toggle } = rows({ admin: true });
    fireEvent.click(screen.getByRole("button", { name: "Post actions" }));
    expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Pin to Wall" }));
    expect(toggle).toHaveBeenCalledWith(row.id, true);
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("offers explicit unpin to admins and preserves own-post delete", () => {
    const { toggle } = rows({ admin: true, own: true, pinned: true });
    fireEvent.click(screen.getByRole("button", { name: "Post actions" }));
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Unpin from Wall" }));
    expect(toggle).toHaveBeenCalledWith(row.id, false);
  });
  it("preserves the ordinary author's delete-only menu", () => {
    rows({ own: true });
    fireEvent.click(screen.getByRole("button", { name: "Post actions" }));
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Pin to Wall" })).toBeNull();
  });
  it("disables mutation triggers while a pin request is pending", () => {
    rows({ admin: true, busy: true });
    expect((screen.getByRole("button", { name: "Post actions" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("shows the two-pin limit without silently replacing a pinned post", async () => {
    const patch = vi.spyOn(api, "patch").mockResolvedValue({ error: { code: "WALL_PIN_LIMIT", message: "Two posts are already pinned. Unpin one before pinning another." } });
    rail(new QueryClient());
    fireEvent.click(screen.getByRole("button", { name: "Post actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Pin to Wall" }));
    await waitFor(() => expect(screen.getByText(/Two posts are already pinned/)).toBeTruthy());
    expect(patch).toHaveBeenCalledWith("/v1/admin/intentcasts/post-a/pin", { pinned: true });
  });
  it("refreshes the Home feed after a successful pin", async () => {
    vi.spyOn(api, "patch").mockResolvedValue({ data: { pinnedAt: "2026-11-20T13:00:00Z" } });
    const client = new QueryClient(); const invalidate = vi.spyOn(client, "invalidateQueries");
    rail(client);
    fireEvent.click(screen.getByRole("button", { name: "Post actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Pin to Wall" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["home", "opportunity-rail"] }));
  });
});
