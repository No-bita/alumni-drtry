import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CityAlumniList } from "../src/components/cities/CityAlumniList";

afterEach(cleanup);

const place = { placeId: "p1", city: "Linkville", country: "India", slug: "linkville" };

function renderList(totalAlumni: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CityAlumniList place={place} initial={{ total: 0, items: [] }} totalAlumni={totalAlumni} onChanged={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("city alumni list with no other members", () => {
  it("hides the filter chips and says so plainly when the viewer is the only member", () => {
    renderList(1);
    expect(screen.queryByRole("group", { name: "Filter alumni" })).toBeNull();
    expect(screen.getByText("No other alumni here yet.")).toBeTruthy();
    expect(screen.queryByText(/matches this filter/)).toBeNull();
  });

  it("keeps the chips and filter-empty note when other members exist", () => {
    renderList(3);
    expect(screen.getByRole("group", { name: "Filter alumni" })).toBeTruthy();
    expect(screen.getByText("Nobody here matches this filter yet. Try another.")).toBeTruthy();
  });
});
