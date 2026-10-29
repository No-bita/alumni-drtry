import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { CitySwitcherSheet } from "../src/components/cities/CitySwitcherSheet";

const blr = { placeId: "blr", city: "Bengaluru", country: "India", slug: "bengaluru", count: 41 };
const mumbai = { placeId: "mum", city: "Mumbai", country: "India", slug: "mumbai", count: 30 };
function PickerHarness() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  return <>
    <button type="button" onClick={() => setOpen(true)}>Change city</button>
    {open ? <CitySwitcherSheet cities={[mumbai, blr]} viewerCity={blr} currentPlaceId="blr" onClose={() => setOpen(false)} /> : null}
    <div data-testid="where">{location.pathname}</div>
  </>;
}
function mount() {
  return render(<MemoryRouter initialEntries={["/intent/location/bengaluru"]}><PickerHarness /></MemoryRouter>);
}
afterEach(cleanup);

describe("Cities city switcher", () => {
  it("opens from the city control and shows real city counts with your city first", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Change city" }));
    const dialog = screen.getByRole("dialog", { name: "All cities" });
    const links = within(dialog).getAllByRole("link");
    expect(links[0].textContent).toMatch(/Bengaluru.*your city.*41 alumni/);
    expect(links[1].textContent).toMatch(/Mumbai.*30 alumni/);
  });
  it("marks the current city and navigates to a selected city, closing the sheet", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Change city" }));
    const dialog = screen.getByRole("dialog", { name: "All cities" });
    expect(within(dialog).getByRole("link", { name: /Bengaluru/ }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(within(dialog).getByRole("link", { name: /Mumbai/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("where").textContent).toBe("/intent/location/mumbai");
  });
  it("closes on backdrop without changing the city", () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Change city" }));
    fireEvent.click(container.querySelector(".cities-sheet__overlay")!);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("where").textContent).toBe("/intent/location/bengaluru");
  });
  it("moves focus into the sheet, closes on Escape and restores trigger focus", async () => {
    mount();
    const trigger = screen.getByRole("button", { name: "Change city" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "All cities" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
  it("filters city names without opening the retired delayed draft-help form", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Change city" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Find a city" }), { target: { value: "Mumb" } });
    expect(screen.queryByRole("link", { name: /Bengaluru/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Mumbai/ })).toBeTruthy();
    expect(screen.queryByText("Draft a request")).toBeNull();
  });
  it("shows the empty result while preserving the selected city", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Change city" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Find a city" }), { target: { value: "No matching city" } });
    expect(screen.getByText("No alumni live in a city by that name yet.")).toBeTruthy();
    expect(screen.getByTestId("where").textContent).toBe("/intent/location/bengaluru");
  });
});
