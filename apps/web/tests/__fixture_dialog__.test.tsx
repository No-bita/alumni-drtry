import { afterEach, describe, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { writeFileSync } from "node:fs";

vi.mock("../src/api/client", async (orig) => ({ ...(await orig<Record<string, unknown>>()), api: { post: vi.fn().mockResolvedValue({ data: {} }), get: vi.fn().mockResolvedValue({ data: {} }) } }));
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({ status: "authenticated", person: { personId: "p1", institutionalEmail: "a@iitbhu.ac.in", fullName: "Aaryan Shah" }, myProfile: { batchYear: 2019, departmentCode: "CSE" }, refetch: vi.fn() }),
}));

import { MatchReachOutDialog } from "../src/components/MatchReachOutDialog";

afterEach(cleanup);

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/home"]}>
        <MatchReachOutDialog recipient={{ id: "p2", fullName: "Priya Sharma" }} source="match" onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("unified dialog fixture", () => {
  it("dumps unified form states", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/home"]}>
          <MatchReachOutDialog recipient={{ id: "p2", fullName: "Priya Sharma" }} source="match" onClose={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>
    );
    await screen.findByText(/Reach out to/i, undefined, { timeout: 8000 });
    writeFileSync("/tmp/fixture-dialog-unified.html", document.body.innerHTML);
    fireEvent.change(screen.getByLabelText(/Topic/i), { target: { value: "referral" } });
    await new Promise((r) => setTimeout(r, 300));
    writeFileSync("/tmp/fixture-dialog-referral.html", document.body.innerHTML);
  }, 20000);
});
