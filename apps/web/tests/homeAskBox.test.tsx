import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { HomeAskBox } from "../src/components/HomeAskBox";

afterEach(cleanup);

function Where() {
  const l = useLocation();
  return <p data-testid="where">{`${l.pathname}${l.search}`}</p>;
}

function mount() {
  return render(
    <MemoryRouter initialEntries={["/home"]}>
      <Routes>
        <Route path="/home" element={<HomeAskBox />} />
        <Route path="/match" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("HomeAskBox", () => {
  it("submits the question to /match", () => {
    mount();
    fireEvent.change(screen.getByLabelText("What do you need help with?"), {
      target: { value: "  Referral at Meesho  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Find alumni" }));
    expect(screen.getByTestId("where").textContent).toBe("/match?q=Referral+at+Meesho");
  });

  it("asks for more words instead of submitting an empty question", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Find alumni" }));
    expect(screen.getByRole("alert").textContent).toBe("Write a few words about what you need.");
    expect(screen.queryByTestId("where")).toBeNull();
  });

  it("example questions submit directly", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Moving to Bengaluru next month" }));
    expect(screen.getByTestId("where").textContent).toBe("/match?q=Moving+to+Bengaluru+next+month");
  });
});
