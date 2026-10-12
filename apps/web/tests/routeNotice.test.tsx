import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { RouteNotice } from "../src/components/RouteNotice";
import { ALREADY_SET_UP_NOTICE, FINISH_PROFILE_NOTICE, noticeState } from "../src/lib/routeNotices";

afterEach(cleanup);

function mount(notice: typeof ALREADY_SET_UP_NOTICE | null) {
  return render(
    <MemoryRouter initialEntries={["/start"]}>
      <Routes>
        <Route
          path="/start"
          element={<Navigate to="/landing" replace state={notice ? noticeState(notice) : undefined} />}
        />
        <Route path="/landing" element={<div>landing page</div>} />
      </Routes>
      <RouteNotice />
    </MemoryRouter>,
  );
}

describe("RouteNotice", () => {
  it("shows the notice carried by a redirect", () => {
    mount(ALREADY_SET_UP_NOTICE);
    expect(screen.getByText("landing page")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("already set up");
  });

  it("shows nothing when the redirect carries no notice", () => {
    mount(null);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("can be dismissed", () => {
    mount(FINISH_PROFILE_NOTICE);
    expect(screen.getByRole("status").textContent).toContain("profile is done");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
