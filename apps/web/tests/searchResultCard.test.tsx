import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SearchProfileView } from "../src/api/client";

const get = vi.hoisted(() => vi.fn());
const searchGet = vi.hoisted(() => vi.fn());
const dialogProps = vi.hoisted(() => ({ last: null as null | Record<string, unknown> }));

vi.mock("../src/api/client", () => ({ api: { get } }));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: searchGet }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));
vi.mock("../src/lib/betaAnalytics", () => ({ trackBetaUsageEvent: vi.fn() }));
vi.mock("../src/components/MatchReachOutDialog", () => ({
  MatchReachOutDialog: (props: Record<string, unknown>) => {
    dialogProps.last = props;
    return (
      <div role="dialog">
        <button type="button" onClick={() => (props.onSent as () => void)()}>
          stub send
        </button>
        <button type="button" onClick={() => (props.onClose as () => void)()}>
          stub close
        </button>
      </div>
    );
  },
}));

import { SearchResultRow, type SearchCardNote } from "../src/components/SearchResultRow";
import { Search } from "../src/pages/Search";

const base: SearchProfileView = {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Asha Rao",
  departmentCode: "CSE",
  departmentName: "Computer Science",
  parsedDepartmentCode: null,
  parsedDepartmentName: null,
  batchYear: 2015,
  parsedJoiningYear: null,
  degreeCode: null,
  degreeName: null,
  headlineRoleTitle: "Product Manager",
  headlineOrganizationName: "Acme",
  residenceCountry: "India",
  residenceCity: "Pune",
  institutionName: "IIT Bombay",
  matchReasons: [],
};

const onNote = vi.fn<(id: string, note: Exclude<SearchCardNote, null>) => void>();
const onReachOut = vi.fn<(p: SearchProfileView) => void>();

function mount(profile: Partial<SearchProfileView> = {}, note: SearchCardNote = null) {
  return render(
    <MemoryRouter>
      <SearchResultRow profile={{ ...base, ...profile }} resultIndex={0} note={note} onNote={onNote} onReachOut={onReachOut} />
    </MemoryRouter>,
  );
}

function mountPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={["/search?q=product"]}>
      <QueryClientProvider client={qc}>
        <Search />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  get.mockReset();
  searchGet.mockReset();
  onNote.mockReset();
  onReachOut.mockReset();
  dialogProps.last = null;
});
afterEach(cleanup);

describe("Search result card", () => {
  it("shows name, institute, class and role at company, without the city", () => {
    mount();
    expect(screen.getByRole("link", { name: "Asha Rao" }).getAttribute("href")).toBe(`/profiles/${base.id}`);
    expect(screen.getByText("IIT Bombay")).toBeTruthy();
    expect(screen.getByText("Product Manager · Acme")).toBeTruthy();
    expect(screen.queryByText(/Pune/)).toBeNull();
    expect(screen.getByRole("link", { name: "View Asha Rao's profile" })).toBeTruthy();
  });

  it("shows no pills when nothing explains the match", () => {
    mount();
    expect(screen.queryByRole("list", { name: "Why this profile matched" })).toBeNull();
  });

  it("shows up to three match reasons, without repeated labels", () => {
    mount({ matchReasons: ["exact_name", "name_match", "company_match", "same_department", "graduating_batch"] });
    const pills = screen.getByRole("list", { name: "Why this profile matched" }).querySelectorAll("li");
    expect([...pills].map((li) => li.textContent)).toEqual(["Name match", "Company match", "Same department"]);
  });

  it("does not look up reachouts until Reach out is tapped", () => {
    mount();
    expect(get).not.toHaveBeenCalled();
  });

  it("asks the page to open the note form when there is no open reachout", async () => {
    get.mockResolvedValue({ data: { yourNote: null } });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Reach out" }));
    await waitFor(() => expect(onReachOut).toHaveBeenCalledWith(expect.objectContaining({ id: base.id })));
    expect(String(get.mock.calls[0][0])).toBe(`/v1/contact-requests/status?recipientPersonId=${base.id}`);
    expect(onNote).not.toHaveBeenCalled();
  });

  it("opens the note form again after an earlier reachout was declined", async () => {
    get.mockResolvedValue({ data: { yourNote: "declined" } });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Reach out" }));
    await waitFor(() => expect(onReachOut).toHaveBeenCalled());
  });

  it("reports an open reachout instead of opening a second form", async () => {
    get.mockResolvedValue({ data: { yourNote: "pending" } });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Reach out" }));
    await waitFor(() => expect(onNote).toHaveBeenCalledWith(base.id, "pending"));
    expect(onReachOut).not.toHaveBeenCalled();
  });

  it("shows where a pending reachout stands", () => {
    mount({}, "pending");
    expect(screen.getByText(/Reachout sent · waiting for reply/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "See your reachouts" }).getAttribute("href")).toBe("/notifications");
    expect(screen.queryByRole("button", { name: "Reach out" })).toBeNull();
  });

  it("shows an accepted reachout with a way to their contact", () => {
    mount({}, "accepted");
    expect(screen.getByText(/Accepted your reachout/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "See their contact" })).toBeTruthy();
  });

  it("says so when the lookup fails, and lets the member try again", async () => {
    get.mockResolvedValue({ error: { code: "NETWORK_ERROR", message: "x" } });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Reach out" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't check your reachouts");
    expect(onReachOut).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Reach out" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("leaves out the institute separator when the institute is unknown", () => {
    mount({ institutionName: null });
    expect(screen.queryByText("IIT Bombay")).toBeNull();
    expect(screen.getByText("Product Manager · Acme")).toBeTruthy();
  });
});

describe("Search page: reaching out from a card", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("opens the note form outside the results with the search source, and marks the card once sent", async () => {
    searchGet.mockResolvedValue({ results: [base], pageInfo: { hasMore: false, nextCursor: null } });
    get.mockResolvedValue({ data: { yourNote: null } });
    const { container } = mountPage();
    fireEvent.click(await screen.findByRole("button", { name: "Reach out" }));
    const dialog = await screen.findByRole("dialog");
    expect(container.querySelector(".search-page__results-scroll")?.contains(dialog)).toBe(false);
    expect(dialogProps.last?.source).toBe("search");
    expect(dialogProps.last?.referral).toEqual({ company: "Acme" });
    expect(dialogProps.last?.recipient).toEqual({ id: base.id, fullName: "Asha Rao" });
    fireEvent.click(screen.getByRole("button", { name: "stub send" }));
    fireEvent.click(screen.getByRole("button", { name: "stub close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(/Reachout sent · waiting for reply/)).toBeTruthy();
  });
});
