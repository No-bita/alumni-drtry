import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/** Areas of experience: list rules, the editor with suggestions, the profile view, and saving. */

const patch = vi.hoisted(() => vi.fn<(path: string, body?: unknown) => Promise<object>>(async () => ({})));
const put = vi.hoisted(() => vi.fn<(path: string, body?: unknown) => Promise<object>>(async () => ({ data: { areas: [] } })));
const state = vi.hoisted(() => ({
  areas: [] as string[] | undefined,
  openTo: null as unknown,
  suggestions: [] as Array<{ label: string; memberCount: number }>,
  suggestCalls: [] as string[],
}));

vi.mock("../src/api/client", async (orig) => {
  const actual = await orig<typeof import("../src/api/client")>();
  return { ...actual, api: { ...actual.api, patch, put, post: vi.fn(async () => ({})), delete: vi.fn(async () => ({})) } };
});
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({
    status: "authenticated",
    person: { role: "alumni", institutionalEmail: "sample@itbhu.ac.in" },
    myProfile: { id: "p1", personalEmail: null, mobilePhone: null, onboardingCompletedAt: "2026-01-01" },
    refetch: vi.fn(),
    logout: vi.fn(),
  }),
}));
vi.mock("../src/components/Nav", () => ({ Nav: () => null }));
vi.mock("../src/lib/assertApiGet", () => ({
  assertApiGet: vi.fn((path: string) => {
    if (path.startsWith("/v1/profiles/")) {
      return Promise.resolve({
        profile: { id: "p1", fullName: "Sample Alum", departmentCode: "cse", batchYear: 2020, residenceCity: "Pune", residenceCountry: "India", openToPreferences: state.openTo },
        occupations: [],
        links: [],
        ...(state.areas ? { areas: state.areas } : {}),
      });
    }
    if (path.startsWith("/v1/areas/suggestions")) {
      state.suggestCalls.push(path);
      return Promise.resolve({ suggestions: state.suggestions });
    }
    return Promise.resolve({ links: [], occupations: [] });
  }),
}));

import { Profile } from "../src/pages/Profile";
import { ProfileAreasCard } from "../src/components/profile/ProfileAreasCard";
import { PersonProfileView } from "../src/components/profile/PersonProfileView";
import type { PublicProfileView } from "../src/api/client";
import { addArea, areasChanged, normalizeAreasForSave, removeArea } from "../src/lib/personAreas";

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Harness({ start = [] as string[], onValue }: { start?: string[]; onValue?: (v: string[]) => void }) {
  const [areas, setAreas] = useState(start);
  return (
    <QueryClientProvider client={client()}>
      <ProfileAreasCard
        draftAreas={areas}
        onDraftAreasChange={(next) => {
          setAreas(next);
          onValue?.(next);
        }}
      />
    </QueryClientProvider>
  );
}

const input = () => screen.getByRole("combobox", { name: "Add an area of experience" });
const chips = () => within(screen.getByRole("list", { name: "Your areas" })).getAllByRole("listitem").map((li) => li.firstChild?.textContent);

beforeEach(() => {
  state.areas = [];
  state.openTo = null;
  state.suggestions = [];
  state.suggestCalls = [];
  patch.mockClear();
  put.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("area list rules", () => {
  it("normalises spacing, refuses repeats in any case, over-long areas and a ninth", () => {
    expect(addArea([], "  D2C   growth ")).toEqual({ ok: true, areas: ["D2C growth"] });
    expect(addArea(["Pricing"], "pricing")).toEqual({ ok: false, reason: "duplicate" });
    expect(addArea([], "x".repeat(41))).toEqual({ ok: false, reason: "too_long" });
    expect(addArea(Array.from({ length: 8 }, (_, i) => `A${i}`), "New")).toEqual({ ok: false, reason: "full" });
    expect(addArea([], "   ")).toEqual({ ok: false, reason: "empty" });
    expect(removeArea(["Pricing", "Ops"], "PRICING")).toEqual(["Ops"]);
  });

  it("only saves when the list really changed, order included", () => {
    expect(normalizeAreasForSave([" Pricing", "pricing", "", "Ops"])).toEqual(["Pricing", "Ops"]);
    expect(areasChanged(["Pricing"], ["Pricing "])).toBe(false);
    expect(areasChanged(["Pricing", "Ops"], ["Ops", "Pricing"])).toBe(true);
    expect(areasChanged([], ["Pricing"])).toBe(true);
  });
});

describe("areas editor", () => {
  it("leaves composition keys to the language keyboard, then adds on ordinary Enter", () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    fireEvent.change(input(), { target: { value: "ni" } });
    for (const key of ["Enter", ",", "ArrowDown", "ArrowUp", "Escape"]) {
      const event = new KeyboardEvent("keydown", { key, isComposing: true, bubbles: true, cancelable: true });
      fireEvent(input(), event);
      expect(event.defaultPrevented).toBe(false);
      expect((input() as HTMLInputElement).value).toBe("ni");
      expect(onValue).not.toHaveBeenCalled();
    }
    // WebKit may end composition before delivering this Enter.
    fireEvent.keyDown(input(), { key: "Enter", keyCode: 229 });
    expect((input() as HTMLInputElement).value).toBe("ni");
    expect(onValue).not.toHaveBeenCalled();
    fireEvent.change(input(), { target: { value: "你好" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(onValue).toHaveBeenCalledWith(["你好"]);
    expect((input() as HTMLInputElement).value).toBe("");
  });

  it("adds with Enter, the Add button or a comma, and removes a chip", () => {
    let last: string[] = [];
    render(<Harness onValue={(v) => (last = v)} />);
    fireEvent.change(input(), { target: { value: "Pricing" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    fireEvent.change(input(), { target: { value: "Supply chain" } });
    fireEvent.keyDown(input(), { key: "," });
    fireEvent.change(input(), { target: { value: "D2C growth" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(chips()).toEqual(["Pricing", "Supply chain", "D2C growth"]);
    expect((input() as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Remove Supply chain" }));
    expect(last).toEqual(["Pricing", "D2C growth"]);
    expect(screen.getByText(/\(2\/8\)/)).toBeTruthy();
  });

  it("says why an area wasn't added and stops at eight", () => {
    render(<Harness start={["Pricing"]} />);
    fireEvent.change(input(), { target: { value: "PRICING" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(screen.getByRole("status").textContent).toBe("You've already added that.");
    cleanup();
    render(<Harness start={Array.from({ length: 8 }, (_, i) => `Area ${i}`)} />);
    expect((input() as HTMLInputElement).disabled).toBe(true);
    expect((input() as HTMLInputElement).placeholder).toBe("You've added 8");
    expect((input() as HTMLInputElement).maxLength).toBe(40);
  });

  it("suggests areas other members use, hides ones already added, and picks with the keyboard", async () => {
    state.suggestions = [
      { label: "Pricing", memberCount: 4 },
      { label: "Dynamic pricing", memberCount: 1 },
    ];
    let last: string[] = [];
    render(<Harness start={["Pricing"]} onValue={(v) => (last = v)} />);
    fireEvent.change(input(), { target: { value: "pri" } });
    const option = await screen.findByRole("option", { name: /Dynamic pricing/ });
    expect(option.textContent).toContain("1 member");
    expect(screen.queryByRole("option", { name: /^Pricing/ })).toBeNull();
    expect(state.suggestCalls.at(-1)).toBe("/v1/areas/suggestions?q=pri");
    expect(input().getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input().getAttribute("aria-activedescendant")).toBe(option.id);
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(last).toEqual(["Pricing", "Dynamic pricing"]);
  });

  it("doesn't ask for suggestions under two characters", async () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: "p" } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 260));
    });
    expect(state.suggestCalls).toEqual([]);
  });
});

describe("areas on the profile", () => {
  const profile: PublicProfileView = { id: "p2", fullName: "Other Alum", departmentCode: "cse", departmentName: "Computer Science", departmentOtherText: null, departmentOtherStatus: null, batchYear: 2018, parsedJoiningYear: 2014, bio: null, residenceCountry: "India", residenceCity: "Bengaluru" };
  const view = (own: boolean, areas?: string[]) =>
    render(
      <MemoryRouter>
        <PersonProfileView profile={profile} occupations={[]} links={[]} isOwnProfile={own} onboardingIncomplete={false} openTo={null} areas={areas} onEdit={vi.fn()} onSignOut={vi.fn()} />
      </MemoryRouter>,
    );

  it("shows a member's areas, in their order, to other alumni", () => {
    const { container } = view(false, ["Pricing", "D2C growth"]);
    expect(screen.getByRole("heading", { name: "Areas of experience" })).toBeTruthy();
    expect(Array.from(container.querySelectorAll(".person-profile__areas li")).map((li) => li.textContent)).toEqual(["Pricing", "D2C growth"]);
    expect(screen.queryByRole("button", { name: "Edit areas of experience" })).toBeNull();
  });

  it("hides the section from others when empty, and invites the owner to add some", () => {
    view(false, []);
    expect(screen.queryByRole("heading", { name: "Areas of experience" })).toBeNull();
    cleanup();
    view(true);
    expect(screen.getByText("No areas added. Ask uses them to find you.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit areas of experience" })).toBeTruthy();
  });
});

describe("editing and saving areas on the profile page", () => {
  const mount = () =>
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={["/profiles/p1?edit=contact"]}>
          <Routes>
            <Route path="/profiles/:id" element={<Profile />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

  it("saves the new list in one call after the profile", async () => {
    state.areas = ["Pricing"];
    mount();
    await screen.findByRole("combobox", { name: "Add an area of experience" });
    expect(chips()).toEqual(["Pricing"]);
    fireEvent.change(input(), { target: { value: "Supply  chain" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/v1/me/areas", { areas: ["Pricing", "Supply chain"] }));
    const profileCall = patch.mock.invocationCallOrder[patch.mock.calls.findIndex((c) => c[0] === "/v1/me/profile")]!;
    expect(profileCall).toBeLessThan(put.mock.invocationCallOrder[0]!);
  });

  it("doesn't call the areas API when nothing changed, or on an older API without areas", async () => {
    state.areas = ["Pricing"];
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/v1/me/profile", expect.anything()));
    expect(put).not.toHaveBeenCalled();
    cleanup();
    state.areas = undefined;
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    expect(put).not.toHaveBeenCalled();
  });

  it("shows the save error and stays in editing when the areas save fails", async () => {
    put.mockResolvedValueOnce({ error: { code: "AREAS_TOO_MANY", message: "Add up to 8 areas." } });
    mount();
    await screen.findByRole("combobox", { name: "Add an area of experience" });
    fireEvent.change(input(), { target: { value: "Pricing" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Add up to 8 areas.")).toBeTruthy();
    expect(input()).toBeTruthy();
  });

  it("suggests adding areas when referrals, mentorship or advising is on and none are added", async () => {
    state.openTo = { selected: ["referrals"] };
    mount();
    const add = await screen.findByRole("button", { name: "Add areas" });
    fireEvent.click(add);
    expect(document.activeElement).toBe(input());
    fireEvent.change(input(), { target: { value: "Pricing" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(screen.queryByRole("button", { name: "Add areas" })).toBeNull();
    cleanup();
    state.openTo = { selected: ["coffee"], limits: { coffee: 2 } };
    mount();
    await screen.findByRole("combobox", { name: "Add an area of experience" });
    expect(screen.queryByRole("button", { name: "Add areas" })).toBeNull();
  });

  it("the Open to editor has no per-tag text box any more", async () => {
    state.openTo = { selected: ["referrals", "intros"] };
    mount();
    await screen.findByRole("combobox", { name: "Add an area of experience" });
    expect(screen.queryByRole("textbox", { name: /subheading/ })).toBeNull();
    expect(document.querySelector(".profile-page__open-to-edit-desc")).toBeNull();
  });
});
