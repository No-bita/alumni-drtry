import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { OccupationView, ProfileLinkView, PublicProfileView } from "../src/api/client";

/** The one-page profile: what visitors and owners see, and editing one section at a time. */

const h = vi.hoisted(() => {
  const state = {
    profile: null as unknown as Record<string, unknown>,
    occupations: [] as unknown[],
    links: [] as unknown[],
    areas: [] as string[] | undefined,
    yourNote: null as null | "pending" | "accepted" | "declined",
    rejected: [] as unknown[],
    delayProfile: null as null | ((v: unknown) => void),
  };
  return {
    state,
    get: vi.fn(),
    patch: vi.fn<(path: string, body?: unknown) => Promise<object>>(async () => ({ data: { profile: {} } })),
    put: vi.fn<(path: string, body?: unknown) => Promise<object>>(async () => ({ data: { areas: [] } })),
    post: vi.fn<(path: string, body?: unknown) => Promise<object>>(async () => ({ data: { organization: { id: "org-new" } } })),
    del: vi.fn<(path: string) => Promise<object>>(async () => ({})),
    track: vi.fn(),
    auth: { value: null as unknown },
  };
});

vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => h.auth.value }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));
vi.mock("../src/components/WhatsAppNotesSettings", () => ({ WhatsAppNotesSettings: () => <section aria-label="WhatsApp" /> }));
vi.mock("../src/lib/betaAnalytics", () => ({ trackBetaUsageEvent: h.track }));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: h.get }));
vi.mock("../src/api/client", async (orig) => {
  const actual = await orig<typeof import("../src/api/client")>();
  return { ...actual, api: { ...actual.api, get: vi.fn(async () => ({ data: null })), patch: h.patch, put: h.put, post: h.post, delete: h.del } };
});

import { Profile } from "../src/pages/Profile";
import { ProfilePageView } from "../src/components/profile/ProfilePageView";
import { displayLinkText, headlineRoleLine, setupSteps, splitCareerAndEducation } from "../src/lib/profilePage";

const occ = (over: Partial<OccupationView>): OccupationView => ({
  id: over.id ?? "o1",
  occupationTypeCode: "full_time_employment",
  occupationTypeName: "Full time employment",
  organizationId: null,
  organizationName: "Meesho",
  roleTitle: "Senior Business Associate",
  description: null,
  startDate: "2025-06-01",
  endDate: null,
  isCurrent: true,
  ...over,
});
const link = (over: Partial<ProfileLinkView>): ProfileLinkView => ({ id: "l1", platform: "GitHub", url: "https://github.com/sample", label: null, ...over });

const baseProfile: PublicProfileView = {
  id: "p2",
  fullName: "Riya Sharma",
  departmentCode: "cse",
  departmentName: "Computer Science",
  departmentOtherText: null,
  departmentOtherStatus: null,
  degreeName: "BTech",
  batchYear: 2019,
  parsedJoiningYear: 2015,
  bio: "An old bio nobody can edit.",
  residenceCity: "Bengaluru",
  residenceCountry: "India",
  openToPreferences: { selected: ["referrals", "coffee"], limits: { coffee: 2 } },
  institutionName: "IIT Bombay",
};

function Where() {
  return <div data-testid="where">{useLocation().pathname + useLocation().search}</div>;
}

function setAuth(over: Record<string, unknown> = {}) {
  h.auth.value = {
    status: "authenticated",
    person: { personId: "me-1", institutionalEmail: "me@iitb.ac.in", role: "alumni", isDemo: false },
    myProfile: { id: "me-1", fullName: "Sample Member", onboardingCompletedAt: "2026-01-01", personalEmail: "me@example.com", mobilePhone: null },
    refetch: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    logoutAll: vi.fn(async () => {}),
    ...over,
  };
}

function mountPage(path: string) {
  h.get.mockImplementation((p: string) => {
    if (p.startsWith("/v1/profiles/")) {
      const body = {
        profile: { ...h.state.profile, id: p.split("/")[3] },
        occupations: h.state.occupations,
        links: h.state.links,
        ...(h.state.areas ? { areas: h.state.areas } : {}),
        yourNote: h.state.yourNote,
      };
      if (h.state.delayProfile) return new Promise((resolve) => (h.state.delayProfile = () => resolve(body)));
      return Promise.resolve(body);
    }
    if (p === "/v1/me/links") return Promise.resolve({ links: h.state.links });
    if (p === "/v1/me/rejected-organizations") return Promise.resolve({ organizations: h.state.rejected });
    if (p.startsWith("/v1/areas/suggestions")) return Promise.resolve({ suggestions: [] });
    return Promise.resolve({});
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/profiles/:id" element={<Profile />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.state.profile = { ...baseProfile } as unknown as Record<string, unknown>;
  h.state.occupations = [occ({})];
  h.state.links = [link({})];
  h.state.areas = ["Pricing", "Marketplace ops"];
  h.state.yourNote = null;
  h.state.rejected = [];
  h.state.delayProfile = null;
  for (const m of [h.patch, h.put, h.post, h.del, h.track, h.get]) m.mockClear();
  setAuth();
});
afterEach(cleanup);

const region = (name: string) => screen.getByRole("region", { name });

describe("section helpers", () => {
  it("splits Career and Education by entry type, and headlines only a current career role", () => {
    const list = [
      occ({ id: "a" }),
      occ({ id: "b", occupationTypeCode: "higher_education_non_research", roleTitle: "MS, Data Science", organizationName: "Sample University", isCurrent: false, endDate: "2021-05-01" }),
      occ({ id: "c", occupationTypeCode: "phd_research", roleTitle: "PhD", isCurrent: false }),
      occ({ id: "d", occupationTypeCode: "postdoctoral_research", roleTitle: "Postdoc", isCurrent: false }),
    ];
    const { career, education } = splitCareerAndEducation(list);
    expect(career.map((o) => o.id)).toEqual(["a", "d"]);
    expect(education.map((o) => o.id).sort()).toEqual(["b", "c"]);
    expect(headlineRoleLine(list[0]!)).toBe("Senior Business Associate at Meesho");
    expect(headlineRoleLine(occ({ organizationName: null }))).toBe("Senior Business Associate");
    expect(displayLinkText("https://www.github.com/sample/")).toBe("github.com/sample");
  });

  it("the setup list has three steps and counts what's done", () => {
    expect(setupSteps({ occupations: [], areas: [], openTo: null }).map((s) => [s.key, s.done])).toEqual([
      ["role", false],
      ["areas", false],
      ["openTo", false],
    ]);
    expect(setupSteps({ occupations: [occ({})], areas: ["A"], openTo: { selected: ["coffee"] } }).every((s) => s.done)).toBe(true);
    // An education entry isn't a current role.
    expect(setupSteps({ occupations: [occ({ occupationTypeCode: "phd_research" })], areas: [], openTo: null })[0]!.done).toBe(false);
  });
});

describe("what a visitor sees", () => {
  it("header: name, institute and class, role at company, city — and no bio", async () => {
    mountPage("/profiles/p2");
    expect(await screen.findByRole("heading", { level: 1, name: "Riya Sharma" })).toBeTruthy();
    expect(screen.getByText("IIT Bombay · Class of 2019")).toBeTruthy();
    expect(screen.getByText("Senior Business Associate at Meesho")).toBeTruthy();
    expect(screen.getByText("Bengaluru, India")).toBeTruthy();
    expect(screen.queryByText(/old bio/)).toBeNull();
  });

  it("sections in order of what helps someone decide, with nothing to edit", async () => {
    mountPage("/profiles/p2");
    await screen.findByRole("heading", { level: 1 });
    const names = Array.from(document.querySelectorAll(".pp-col > section")).map((s) => s.getAttribute("aria-label"));
    expect(names).toEqual(["Areas of experience", "Education", "Links", "Career history", "Open to helping with"]);
    expect(within(region("Areas of experience")).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Pricing", "Marketplace ops"]);
    expect(within(region("Education")).getByText("IIT Bombay")).toBeTruthy();
    expect(within(region("Education")).getByText("BTech, Computer Science")).toBeTruthy();
    expect(within(region("Education")).getByText("2015 – 2019")).toBeTruthy();
    expect(within(region("Links")).getByRole("link", { name: /github\.com\/sample/ }).getAttribute("href")).toBe("https://github.com/sample");
    expect(within(region("Open to helping with")).getByText(/Coffee chats/).textContent).toContain("2 a week");
    expect(screen.queryByRole("region", { name: "Contact" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Edit / })).toBeNull();
    expect(screen.queryByRole("region", { name: "Finish your profile" })).toBeNull();
  });

  it("empty sections are hidden from visitors", async () => {
    h.state.areas = [];
    h.state.links = [];
    h.state.occupations = [];
    h.state.profile = { ...baseProfile, openToPreferences: null };
    mountPage("/profiles/p2");
    await screen.findByRole("heading", { level: 1 });
    for (const name of ["Areas of experience", "Links", "Career history", "Open to helping with"]) {
      expect(screen.queryByRole("region", { name })).toBeNull();
    }
    expect(region("Education")).toBeTruthy();
  });

  it("the building photo only sits in a short career history", () => {
    const view = (n: number) =>
      render(
        <MemoryRouter>
          <ProfilePageView profile={baseProfile} occupations={Array.from({ length: n }, (_, i) => occ({ id: `o${i}`, isCurrent: i === 0 }))} links={[]} areas={[]} openTo={null} yourNote={null} isOwnProfile={false} onboardingIncomplete={false} onEdit={vi.fn()} onReachOut={vi.fn()} onSignOut={vi.fn()} />
        </MemoryRouter>,
      );
    view(3);
    expect(document.querySelector(".pp-card__photo")).toBeTruthy();
    cleanup();
    view(4);
    expect(document.querySelector(".pp-card__photo")).toBeNull();
  });

  it("Reach out opens the reachout form, with their company filled in for a referral", async () => {
    mountPage("/profiles/p2");
    fireEvent.click(await screen.findByRole("button", { name: "Reach out" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Topic/), { target: { value: "referral" } });
    expect((within(dialog).getByLabelText("Company") as HTMLInputElement).value).toBe("Meesho");
  });

  it("shows where an earlier reachout stands instead of the button", async () => {
    h.state.yourNote = "pending";
    mountPage("/profiles/p2");
    expect((await screen.findByText(/Reachout sent/)).textContent).toMatch(/Reachout sent · waiting for reply/);
    expect(screen.queryByRole("button", { name: "Reach out" })).toBeNull();
    cleanup();
    h.state.yourNote = "accepted";
    mountPage("/profiles/p2");
    expect(await screen.findByText(/Accepted your reachout/)).toBeTruthy();
    cleanup();
    h.state.yourNote = "declined";
    mountPage("/profiles/p2");
    expect(await screen.findByRole("button", { name: "Reach out" })).toBeTruthy();
  });

  it("no sign-out on someone else's profile, but Share is there", async () => {
    mountPage("/profiles/p2");
    fireEvent.click(await screen.findByRole("button", { name: "More" }));
    expect(screen.getByRole("button", { name: "Share profile" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });
});

describe("what the owner sees", () => {
  it("pencils on every section, the private Contact card, and no Reach out", async () => {
    mountPage("/profiles/me-1");
    await screen.findByRole("heading", { level: 1 });
    for (const label of ["Edit where you live", "Edit areas of experience", "Edit education", "Edit links", "Edit career history", "Edit open to", "Edit contact details"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    expect(within(region("Contact")).getByText("me@example.com")).toBeTruthy();
    expect(within(region("Contact")).getByText(/Only you can see this/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reach out" })).toBeNull();
    expect(screen.queryByRole("region", { name: "WhatsApp" })).toBeNull();
  });

  it("empty sections invite the owner, and the setup list goes once everything is done", async () => {
    h.state.areas = [];
    h.state.occupations = [];
    mountPage("/profiles/me-1");
    const setup = await screen.findByRole("region", { name: "Finish your profile" });
    expect(within(setup).getByText("1 of 3 done")).toBeTruthy();
    expect(within(region("Areas of experience")).getByText(/Ask uses these to find you/)).toBeTruthy();
    fireEvent.click(within(setup).getAllByRole("button", { name: "Add" })[1]!);
    expect(await screen.findByRole("dialog", { name: "Areas of experience" })).toBeTruthy();
    cleanup();
    h.state.areas = ["Pricing"];
    h.state.occupations = [occ({})];
    mountPage("/profiles/me-1");
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("region", { name: "Finish your profile" })).toBeNull();
  });

  it("sign out, and sign out of all devices after one confirmation", async () => {
    mountPage("/profiles/me-1");
    fireEvent.click(await screen.findByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out of all devices" }));
    expect(screen.getByText(/every phone and computer, including this one/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes, sign out everywhere" }));
    const auth = h.auth.value as { logoutAll: ReturnType<typeof vi.fn> };
    await waitFor(() => expect(auth.logoutAll).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/signed-out"));
  });

  it("a failed sign-out everywhere is shown, and the demo account has no 'all devices'", async () => {
    setAuth({ logoutAll: vi.fn(async () => Promise.reject(new Error("Couldn't sign out of all devices. Try again."))) });
    mountPage("/profiles/me-1");
    fireEvent.click(await screen.findByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out of all devices" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, sign out everywhere" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Try again");
    cleanup();
    setAuth({ person: { personId: "me-1", institutionalEmail: "demo@iitb.ac.in", role: "alumni", isDemo: true } });
    mountPage("/profiles/me-1");
    fireEvent.click(await screen.findByRole("button", { name: "More" }));
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign out of all devices" })).toBeNull();
  });

  it("a company that wasn't accepted is flagged on your own profile only, and opens Career history", async () => {
    h.state.rejected = [{ id: "org-1", name: "Acme Dynacorp", rejectionReason: "Can't verify this company" }];
    mountPage("/profiles/me-1");
    expect(await screen.findByText(/‘Acme Dynacorp’ wasn’t accepted as a company\. Reason: Can't verify this company\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Update company" }));
    expect(await screen.findByRole("dialog", { name: "Career history" })).toBeTruthy();
    cleanup();
    mountPage("/profiles/p2");
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText(/Acme Dynacorp/)).toBeNull();
  });
});

describe("editing one section at a time", () => {
  it("where you live: saves only city and country", async () => {
    mountPage("/profiles/me-1");
    fireEvent.click(await screen.findByRole("button", { name: "Edit where you live" }));
    const dialog = await screen.findByRole("dialog", { name: "Where you live" });
    fireEvent.change(within(dialog).getByLabelText("City"), { target: { value: " Pune " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(h.patch).toHaveBeenCalledWith("/v1/me/profile", { residenceCountry: "India", residenceCity: "Pune" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.track).not.toHaveBeenCalled();
  });

  it("?edit=city from Cities focuses the city and counts a changed city", async () => {
    mountPage("/profiles/me-1?edit=city");
    const dialog = await screen.findByRole("dialog", { name: "Where you live" });
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByLabelText("City")));
    fireEvent.change(within(dialog).getByLabelText("City"), { target: { value: "Pune" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(h.track).toHaveBeenCalledWith("cities_city_updated"));
  });

  it("?edit=contact waits for the profile to load, then opens Contact", async () => {
    h.state.delayProfile = () => {};
    mountPage("/profiles/me-1?edit=contact");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => {
      h.state.delayProfile?.(null);
    });
    const dialog = await screen.findByRole("dialog", { name: "Contact" });
    expect((within(dialog).getByLabelText("Personal email") as HTMLInputElement).value).toBe("me@example.com");
    fireEvent.change(within(dialog).getByLabelText("Phone"), { target: { value: "+91 90000 00000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(h.patch).toHaveBeenCalledWith("/v1/me/profile", { personalEmail: "me@example.com", mobilePhone: "+91 90000 00000" }));
  });

  it("open to: the cap notice from Cities, and an empty selection saves as null", async () => {
    mountPage("/profiles/me-1?edit=open-to&limit=city_help");
    const dialog = await screen.findByRole("dialog", { name: "Open to helping with" });
    expect(within(dialog).getByText(/make room for city help/)).toBeTruthy();
    fireEvent.click(within(dialog).getByLabelText("Referrals"));
    fireEvent.click(within(dialog).getByLabelText("Coffee chats"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(h.patch).toHaveBeenCalledWith("/v1/me/profile", { openToPreferences: null }));
  });

  it("open to: turning on referrals with no areas offers to add them", async () => {
    h.state.areas = [];
    h.state.profile = { ...baseProfile, openToPreferences: null };
    mountPage("/profiles/me-1");
    fireEvent.click(await screen.findByRole("button", { name: "Edit open to" }));
    const dialog = await screen.findByRole("dialog", { name: "Open to helping with" });
    expect(within(dialog).queryByRole("button", { name: "Add areas" })).toBeNull();
    fireEvent.click(within(dialog).getByLabelText("Referrals"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add areas" }));
    expect(await screen.findByRole("dialog", { name: "Areas of experience" })).toBeTruthy();
  });

  it("areas: saves the new list in one call, and nothing when unchanged", async () => {
    mountPage("/profiles/me-1");
    fireEvent.click(await screen.findByRole("button", { name: "Edit areas of experience" }));
    let dialog = await screen.findByRole("dialog", { name: "Areas of experience" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.put).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Edit areas of experience" }));
    dialog = await screen.findByRole("dialog", { name: "Areas of experience" });
    const input = within(dialog).getByRole("combobox", { name: "Add an area of experience" });
    fireEvent.change(input, { target: { value: "Supply chain" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(h.put).toHaveBeenCalledWith("/v1/me/areas", { areas: ["Pricing", "Marketplace ops", "Supply chain"] }));
  });

  it("career: add, edit and remove each save on their own; education types stay out of the list", async () => {
    h.state.occupations = [occ({}), occ({ id: "edu", occupationTypeCode: "higher_education_non_research", roleTitle: "MS, Data Science", isCurrent: false })];
    mountPage("/profiles/me-1");
    fireEvent.click(await screen.findByRole("button", { name: "Edit career history" }));
    const dialog = await screen.findByRole("dialog", { name: "Career history" });
    expect(within(dialog).queryByText("MS, Data Science")).toBeNull();
    expect(within(dialog).queryByRole("option", { name: /Master's/ })).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: /Add a role/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(within(dialog).getByText("Add the role.")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/^Role/), { target: { value: "Product Manager" } });
    fireEvent.change(within(dialog).getByLabelText("Company"), { target: { value: "Sample Co" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/v1/me/occupations", expect.objectContaining({ roleTitle: "Product Manager", organizationId: "org-new", occupationTypeCode: "full_time_employment" })));

    fireEvent.click(await within(dialog).findByRole("button", { name: "Edit Senior Business Associate" }));
    fireEvent.change(within(dialog).getByLabelText(/^Role/), { target: { value: "Associate" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(h.patch).toHaveBeenCalledWith("/v1/me/occupations/o1", expect.objectContaining({ roleTitle: "Associate" })));

    fireEvent.click(await within(dialog).findByRole("button", { name: "Remove Senior Business Associate" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(h.del).toHaveBeenCalledWith("/v1/me/occupations/o1"));
  });

  it("education: adds an MS or PhD, and the institute line is locked", async () => {
    mountPage("/profiles/me-1");
    fireEvent.click(await screen.findByRole("button", { name: "Edit education" }));
    const dialog = await screen.findByRole("dialog", { name: "Education" });
    expect(within(dialog).getByText(/IIT Bombay · BTech, Computer Science · 2015 – 2019/)).toBeTruthy();
    expect(within(dialog).getByText(/can't be changed here/)).toBeTruthy();
    expect(within(dialog).queryByLabelText("Your department")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: /Add an MS, MBA or PhD/ }));
    fireEvent.change(within(dialog).getByLabelText(/^Program/), { target: { value: "MBA" } });
    fireEvent.change(within(dialog).getByLabelText("Degree"), { target: { value: "higher_education_non_research" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/v1/me/occupations", expect.objectContaining({ roleTitle: "MBA", occupationTypeCode: "higher_education_non_research" })));
  });

  it("education: an 'Other' department's typed name stays editable and can't be emptied", async () => {
    h.state.profile = { ...baseProfile, departmentCode: "other", departmentName: null, departmentOtherText: "Applied Mechanics", departmentOtherStatus: "pending" };
    mountPage("/profiles/me-1");
    fireEvent.click(await screen.findByRole("button", { name: "Edit education" }));
    const dialog = await screen.findByRole("dialog", { name: "Education" });
    const field = within(dialog).getByLabelText("Your department");
    expect(within(dialog).getByText(/Waiting for review/)).toBeTruthy();
    fireEvent.change(field, { target: { value: " " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save department" }));
    expect(within(dialog).getByText("Please specify your department.")).toBeTruthy();
    expect(h.patch).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "Ceramic Engineering " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save department" }));
    await waitFor(() => expect(h.patch).toHaveBeenCalledWith("/v1/me/profile", { departmentOtherText: "Ceramic Engineering" }));
  });

  it("career: editing hides Done and close asks before discarding", async () => {
    mountPage("/profiles/me-1");
    fireEvent.click(await screen.findByRole("button", { name: "Edit career history" }));
    const dialog = await screen.findByRole("dialog", { name: "Career history" });
    fireEvent.click(within(dialog).getByRole("button", { name: /Add a role/ }));
    expect(within(dialog).queryByRole("button", { name: "Done" })).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("Role"), { target: { value: "Unsaved role" } });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(confirm).toHaveBeenCalled();
    expect(within(dialog).getByLabelText("Role")).toHaveProperty("value", "Unsaved role");
    confirm.mockReturnValue(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    confirm.mockRestore();
  });

  it("links: X is absent from display and editor and unrelated saves never delete it", async () => {
    h.state.links = [link({ id: "old-x", platform: "Twitter", url: "https://x.com/me" })];
    mountPage("/profiles/me-1");
    fireEvent.click(await screen.findByRole("button", { name: "Edit links" }));
    const dialog = await screen.findByRole("dialog", { name: "Links" });
    expect(within(dialog).queryByLabelText(/Twitter/)).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /Remove Twitter/ })).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("GitHub"), { target: { value: "@sample" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(h.post).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("GitHub"), { target: { value: "https://github.com/sample" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(h.post).toHaveBeenCalled());
    expect(h.del).not.toHaveBeenCalled();
  });

  it("links: adds, changes and removes in one save, and checks a bad link first", async () => {
    h.state.links = [link({}), link({ id: "l2", platform: "Blog", url: "https://portfolio.example.com" })];
    mountPage("/profiles/me-1");
    fireEvent.click(await screen.findByRole("button", { name: "Edit links" }));
    const dialog = await screen.findByRole("dialog", { name: "Links" });
    fireEvent.change(within(dialog).getByLabelText("LinkedIn"), { target: { value: "linkedin.com/company/example" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByRole("alert").textContent).toMatch(/LinkedIn profile/);
    expect(h.post).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("LinkedIn"), { target: { value: "https://linkedin.com/in/me" } });
    fireEvent.change(within(dialog).getByLabelText("GitHub"), { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove Blog" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/v1/me/links", { platform: "LinkedIn", url: "https://www.linkedin.com/in/me", label: null }));
    await waitFor(() => expect(h.del).toHaveBeenCalledWith("/v1/me/links/l1"));
    await waitFor(() => expect(h.del).toHaveBeenCalledWith("/v1/me/links/l2"));
  });

  it("links: a failed save keeps the sheet open with the error and what was typed", async () => {
    h.post.mockResolvedValueOnce({ error: { code: "INTERNAL_SERVER_ERROR", message: "Something went wrong." } });
    mountPage("/profiles/me-1");
    fireEvent.click(await screen.findByRole("button", { name: "Edit links" }));
    const dialog = await screen.findByRole("dialog", { name: "Links" });
    fireEvent.change(within(dialog).getByLabelText("LinkedIn"), { target: { value: "https://linkedin.com/in/me" } });
    const profileLoads = h.get.mock.calls.filter((c) => String(c[0]).startsWith("/v1/profiles/")).length;
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe("Couldn't save your links. Something went wrong.");
    expect(screen.getByRole("dialog", { name: "Links" })).toBe(dialog);
    expect((within(dialog).getByLabelText("LinkedIn") as HTMLInputElement).value).toBe("https://linkedin.com/in/me");
    // What did save is reloaded behind the sheet.
    await waitFor(() => expect(h.get.mock.calls.filter((c) => String(c[0]).startsWith("/v1/profiles/")).length).toBeGreaterThan(profileLoads));
    // Retrying works and then closes.
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it.each(["Save", "Cancel"])("open to: ticks survive the 'Add areas' detour (areas %s)", async (how) => {
    h.state.areas = [];
    h.state.profile = { ...baseProfile, openToPreferences: null };
    mountPage("/profiles/me-1");
    fireEvent.click(await screen.findByRole("button", { name: "Edit open to" }));
    let dialog = await screen.findByRole("dialog", { name: "Open to helping with" });
    fireEvent.click(within(dialog).getByLabelText("Referrals"));
    fireEvent.click(within(dialog).getByLabelText("Mentorship"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add areas" }));
    const areasDialog = await screen.findByRole("dialog", { name: "Areas of experience" });
    if (how === "Save") {
      h.state.areas = ["Pricing"];
      const input = within(areasDialog).getByRole("combobox", { name: "Add an area of experience" });
      fireEvent.change(input, { target: { value: "Pricing" } });
      fireEvent.keyDown(input, { key: "Enter" });
    }
    fireEvent.click(within(areasDialog).getByRole("button", { name: how }));
    dialog = await screen.findByRole("dialog", { name: "Open to helping with" });
    expect((within(dialog).getByLabelText("Referrals") as HTMLInputElement).checked).toBe(true);
    expect((within(dialog).getByLabelText("Mentorship") as HTMLInputElement).checked).toBe(true);
    if (how === "Save") {
      expect(h.put).toHaveBeenCalledWith("/v1/me/areas", { areas: ["Pricing"] });
      await waitFor(() => expect(within(dialog).queryByRole("button", { name: "Add areas" })).toBeNull());
    }
    expect(h.patch).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(h.patch).toHaveBeenCalledWith("/v1/me/profile", { openToPreferences: { selected: ["referrals", "mentorship"] } }));
  });

  it("opening Areas directly still just closes when done", async () => {
    mountPage("/profiles/me-1");
    fireEvent.click(await screen.findByRole("button", { name: "Edit areas of experience" }));
    const dialog = await screen.findByRole("dialog", { name: "Areas of experience" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Escape closes the sheet without saving", async () => {
    mountPage("/profiles/me-1");
    fireEvent.click(await screen.findByRole("button", { name: "Edit where you live" }));
    await screen.findByRole("dialog", { name: "Where you live" });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.patch).not.toHaveBeenCalled();
  });
});
