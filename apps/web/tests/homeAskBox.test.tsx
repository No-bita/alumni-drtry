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
    fireEvent.change(screen.getByLabelText("How can Alma Mater help you?"), {
      target: { value: "  Referral at Meesho  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Find alumni" }));
    expect(screen.getByTestId("where").textContent).toBe("/match?q=Referral+at+Meesho");
  });

  it("rests disabled until a question is typed, then asks for more words on a too-short question", () => {
    mount();
    const go = screen.getByRole("button", { name: "Find alumni" });
    // Careers pattern: the arrow rests muted while the field is empty.
    expect(go).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("How can Alma Mater help you?"), {
      target: { value: "hi" },
    });
    expect(go).toHaveProperty("disabled", false);
    fireEvent.click(go);
    expect(screen.getByRole("alert").textContent).toBe("Write a few words about what you need.");
    expect(screen.queryByTestId("where")).toBeNull();
  });

  it("example questions submit directly", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Breaking into product management" }));
    expect(screen.getByTestId("where").textContent).toBe("/match?q=Breaking+into+product+management");
  });

  it("the phone chip shows a short label and asks the full question", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Breaking into PM" }));
    expect(screen.getByTestId("where").textContent).toBe("/match?q=Breaking+into+product+management");
  });
});
