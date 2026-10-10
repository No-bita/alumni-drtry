import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NAV_INTENT_LABELS } from "../src/constants/intents";

const flags = vi.hoisted(() => ({ hub: false }));
vi.mock("../src/lib/devHubPages", () => ({
  get isDevHubPagesEnabled() {
    return flags.hub;
  },
}));
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({
    status: "authenticated",
    person: { personId: "p1", institutionalEmail: "rahul.s@iitbhu.ac.in", role: "alumni" },
    myProfile: { fullName: "Rahul S" },
    signOut: vi.fn(),
  }),
}));
vi.mock("../src/lib/notificationsQueries", () => ({
  useNotificationsSummary: () => ({ data: undefined }),
}));
vi.mock("../src/components/AppToolbarGlobalSearch", () => ({ AppToolbarGlobalSearch: () => <div /> }));

import { Nav } from "../src/components/Nav";

afterEach(cleanup);

function mount() {
  const qc = new QueryClient();
  return render(
    <MemoryRouter initialEntries={["/home"]}>
      <QueryClientProvider client={qc}>
        <Nav variant="home" avatarName="Rahul" />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("Nav hub tabs", () => {
  it("hides the Events tab when placeholder hub pages are off", () => {
    flags.hub = false;
    mount();
    expect(screen.queryByText(NAV_INTENT_LABELS.events)).toBeNull();
  });
  it("shows the Events tab when they are on", () => {
    flags.hub = true;
    mount();
    expect(screen.getAllByText(NAV_INTENT_LABELS.events).length).toBeGreaterThan(0);
  });
  it("always keeps the real tabs", () => {
    flags.hub = false;
    mount();
    expect(screen.getAllByText(NAV_INTENT_LABELS.career).length).toBeGreaterThan(0);
    expect(screen.getAllByText(NAV_INTENT_LABELS.location).length).toBeGreaterThan(0);
  });
});
