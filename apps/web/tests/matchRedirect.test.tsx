import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("../src/pages/AskMode", () => ({ AskMode: () => <p>ask mode</p> }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));

import { MatchPage } from "../src/pages/MatchPage";
import { Search } from "../src/pages/Search";
import { askParamsFromMatch, matchParamsFromAsk, matchResultAsProfile } from "../src/lib/matchApi";

function Where() {
  const l = useLocation();
  return <output data-testid="where">{`${l.pathname}${l.search}`}</output>;
}

function mount(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/match" element={<MatchPage />} />
        <Route path="/search" element={<><Where /><Search /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("/match is one page with /search", () => {
  it("sends an old question link to Ask mode, keeping every other parameter", () => {
    mount("/match?q=Referral+at+Razorpay&cat=referral&company=Razorpay&reach=a1&via=whatsapp");
    expect(screen.getByTestId("where").textContent).toBe(
      "/search?ask=Referral+at+Razorpay&cat=referral&company=Razorpay&reach=a1&via=whatsapp",
    );
    expect(screen.getByText("ask mode")).toBeTruthy();
  });

  it("keeps topic shortcuts and starters that have no question yet", () => {
    mount("/match?cat=interview_prep");
    expect(screen.getByTestId("where").textContent).toBe("/search?ask=&cat=interview_prep");
    cleanup();
    mount("/match?draft=Looking+for+a+co-founder&cat=founder_advice");
    expect(screen.getByTestId("where").textContent).toBe("/search?ask=&draft=Looking+for+a+co-founder&cat=founder_advice");
  });

  it("plain /match opens Ask mode with an empty question", () => {
    mount("/match");
    expect(screen.getByTestId("where").textContent).toBe("/search?ask=");
  });
});

describe("param mapping and card shape", () => {
  it("round-trips the question between q and ask", () => {
    const ask = askParamsFromMatch(new URLSearchParams("q=hi&cat=referral"));
    expect(ask.toString()).toBe("ask=hi&cat=referral");
    expect(matchParamsFromAsk(ask).toString()).toBe("q=hi&cat=referral");
  });

  it("turns match reasons into the card's pills", () => {
    const profile = matchResultAsProfile({
      id: "x", fullName: "A B", batchYear: 2016, departmentCode: "eee", departmentName: null,
      headlineRoleTitle: "PM", headlineOrganizationName: "Razorpay", residenceCity: null, residenceCountry: null,
      whyThem: "", reasons: [{ key: "k", text: "Currently PM at Razorpay" }], openTo: [], relevantOpenTo: [],
      yourNote: null, replyStats: null,
    });
    expect(profile.matchReasons).toEqual(["Currently PM at Razorpay"]);
  });
});
