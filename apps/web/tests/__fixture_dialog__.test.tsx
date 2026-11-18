import { describe, it, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { writeFileSync } from "node:fs";
import { MatchReachOutDialog } from "../src/components/MatchReachOutDialog";

vi.mock("../src/api/client", async (orig) => ({ ...(await orig<Record<string, unknown>>()), api: { post: vi.fn().mockResolvedValue({ data: {} }), get: vi.fn().mockResolvedValue({ data: {} }) } }));
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({ status: "authenticated", person: { personId: "p1", institutionalEmail: "a@iitbhu.ac.in", fullName: "Aaryan Shah" }, myProfile: { batchYear: 2019, departmentCode: "CSE" }, refetch: vi.fn() }),
}));

afterEach(cleanup);

describe("dialog fixture", () => {
  it("dumps purpose step and advice fields step", async () => {
    const r = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/home"]}>
        <MatchReachOutDialog recipient={{ id: "p2", fullName: "Priya Sharma" }} source="match" onClose={() => {}} />
      </MemoryRouter>
      </QueryClientProvider>
    );
    await screen.findByText(/What do you need from/i, undefined, { timeout: 8000 });
    writeFileSync("/tmp/fixture-dialog-purpose.html", document.body.innerHTML);
    fireEvent.click(screen.getByText("Ask for advice"));
    await screen.findByText(/Your question/i, undefined, { timeout: 8000 });
    writeFileSync("/tmp/fixture-dialog-advice.html", document.body.innerHTML);
    r.unmount();
  }, 20000);
});
