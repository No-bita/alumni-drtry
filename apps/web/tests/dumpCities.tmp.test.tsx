// Scratch renderer: dumps phone Cities-page HTML for the mockup harness. Not part of the suite.
import { afterEach, describe, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { writeFileSync } from "node:fs";
import type { CityAlum, CityPayload, CityPerson, CityRef } from "../src/lib/cities";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const wallOpen = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: apiGet }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));
vi.mock("../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api/client")>()),
  api: { get: vi.fn(), post: apiPost, patch: vi.fn(), delete: vi.fn() },
}));
vi.mock("../src/components/PostBulletinFlow", async () => {
  const { useImperativeHandle } = await import("react");
  return {
    PostBulletinFlow: ({ ref }: { ref: import("react").Ref<{ open: (o: unknown) => void; close: () => void }> }) => {
      useImperativeHandle(ref, () => ({ open: wallOpen, close: () => {} }));
      return null;
    },
  };
});

import { LocationPage } from "../src/pages/LocationPage";

const BLR: CityRef = { placeId: "blr", city: "Bengaluru", country: "India", slug: "bengaluru" };
const person = (id: string, fullName: string, extra: Partial<CityPerson> = {}): CityPerson => ({
  id, fullName, batchYear: 2016, departmentCode: "cse", departmentName: "Computer Science",
  roleTitle: "Engineer", organizationName: "Acme", ...extra,
});
const alum = (p: CityPerson): CityAlum => ({ person: p, sharedTag: "Same batch", coffee: { open: true, limit: 2, spotsLeft: 1, askedByMe: false } });

function payload(over: Partial<CityPayload> = {}): CityPayload {
  return {
    place: BLR,
    viewerRole: "local",
    viewerCity: BLR,
    v1Enabled: true,
    counts: { alumni: 41, openToCityHelp: 6 },
    arrivalPrompt: false,
    arrivals: null,
    myArrival: null,
    offers: [],
    helpPanel: { askCount30d: 12, pendingNotesForMe: 0, cityHelpOn: false, openToCount: 2 },
    alumni: { total: 2, items: [alum(person("sneha", "Sneha Nair")), alum(person("vikram", "Vikram Rao"))] },
    posts: [
      { id: "p1", kind: "ask", content: "Looking for a flat in Indiranagar\n\nMoving in January", authorPersonId: "s1", authorFullName: "Sneha Nair", authorBatchYear: 2016, createdAt: new Date().toISOString(), isMine: false, audience: null },
    ],
    postsHasMore: false,
    chapterLink: null,
    helpers: [],
    others: [],
    pendingCityAsks: 0,
    country: null,
    ...over,
  };
}

function world(inbox: unknown[], sent: unknown[]) {
  authState.value = {
    status: "authenticated",
    person: { personId: "p1", institutionalEmail: "a@iitbhu.ac.in", role: "alumni" },
    myProfile: { id: "me1", fullName: "Me", openToPreferences: { selected: ["mentorship"] } },
    refetch: vi.fn(),
  };
  apiGet.mockImplementation(async (path: string) => {
    if (path === "/v1/cities") return { cities: [{ ...BLR, alumniCount: 41 }] };
    if (path === "/v1/cities/blr") return payload();
    if (path === "/v1/contact-requests/inbox") return { requests: inbox };
    if (path === "/v1/contact-requests/sent") return { requests: sent };
    if (path === "/v1/careers/my-company-demand") return { demand: null };
    throw new Error(`unexpected ${path}`);
  });
}

async function dump(inbox: unknown[], sent: unknown[], file: string) {
  world(inbox, sent);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <MemoryRouter initialEntries={["/intent/location/bengaluru"]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/intent/location/:citySlug" element={<LocationPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Reachouts waiting for you" });
  await waitFor(() => {
    if (!container.querySelector(".cities-hub__grid")) throw new Error("not ready");
  });
  await new Promise((resolve) => setTimeout(resolve, 120));
  writeFileSync(file, container.innerHTML);
  cleanup();
}

describe("dump", () => {
  it("no reachouts", async () => {
    await dump([], [], "/tmp/alma-notch-demo/cities-noreachouts-body.html");
  });
  it("with reachouts", async () => {
    await dump([{ id: "i1" }], [], "/tmp/alma-notch-demo/cities-withreachouts-body.html");
  });
});
