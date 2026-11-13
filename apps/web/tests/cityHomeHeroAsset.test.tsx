import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CityHome } from "../src/components/cities/CityHome";
import type { CityPayload } from "../src/lib/cities";

vi.mock("../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api/client")>()),
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

afterEach(cleanup);

const payload: CityPayload = {
  place: { placeId: "blr", city: "Bengaluru", country: "India", slug: "bengaluru" },
  viewerRole: "local",
  viewerCity: null,
  v1Enabled: true,
  counts: { alumni: 41, openToCityHelp: 6 },
  arrivalPrompt: false,
  arrivals: null,
  myArrival: null,
  offers: [],
  helpPanel: null,
  alumni: null,
  posts: [],
  postsHasMore: false,
  chapterLink: null,
  helpers: [],
  others: [],
  pendingCityAsks: 0,
  country: null,
};

describe("CityHome hero photo", () => {
  it("serves the placeholder from the app base, not the site root (Vite emits public/ under /app)", () => {
    const { container } = render(
      <MemoryRouter>
        <CityHome data={payload} profileId={null} onChanged={() => {}} onOptIn={() => {}} onAsk={() => {}} onNotice={() => {}} />
      </MemoryRouter>,
    );
    const img = container.querySelector("img.cities-home__photohero-img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("/app/media/city-hero-placeholder.jpg");
  });

  it("keeps readable linked credit inside the image, with no placeholder or helper row", () => {
    const { container } = render(
      <MemoryRouter>
        <CityHome data={payload} profileId={null} onChanged={() => {}} onOptIn={() => {}} onAsk={() => {}} onNotice={() => {}} />
      </MemoryRouter>,
    );
    const hero = container.querySelector(".cities-home__photohero")!;
    expect(hero.querySelector(".cities-home__photohero-credit")?.textContent).toBe("Photo: AjayTorvi · CC BY-SA 4.0");
    expect(screen.getByRole("link", { name: "AjayTorvi" }).getAttribute("href")).toBe("https://commons.wikimedia.org/wiki/File:Vidhan_Soudha_-_Bangalore.jpg");
    expect(screen.getByRole("link", { name: "CC BY-SA 4.0" }).getAttribute("href")).toBe("https://creativecommons.org/licenses/by-sa/4.0/");
    expect(screen.queryByText(/Placeholder photo/)).toBeNull();
    expect(screen.queryByText(/Get practical help/)).toBeNull();
  });
});
