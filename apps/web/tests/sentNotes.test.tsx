import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const get = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: get }));

import { SentNotesSection } from "../src/components/SentNotesSection";
import { replyStatsLine } from "../src/lib/sentNotes";

afterEach(() => {
  cleanup();
  get.mockReset();
});

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <SentNotesSection enabled />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const now = new Date().toISOString();

describe("SentNotesSection", () => {
  it("lists notes with status, and the shared contact only for accepted ones", async () => {
    get.mockResolvedValue({
      requests: [
        { id: "1", recipientPersonId: "a", recipientFullName: "Ananya Rao", message: "Referral please", status: "pending", recipientContactShared: null, createdAt: now, respondedAt: null },
        { id: "2", recipientPersonId: "b", recipientFullName: "Karan Mehta", message: "Interview prep?", status: "accepted", recipientContactShared: "karan@example.com", createdAt: now, respondedAt: now },
        { id: "3", recipientPersonId: "c", recipientFullName: "Neha Iyer", message: "Berlin tips?", status: "declined", recipientContactShared: null, createdAt: now, respondedAt: now },
        { id: "4", recipientPersonId: "d", recipientFullName: "Arun Alum", message: "PM referral?", status: "accepted", recipientContactShared: "+919876543210", createdAt: now, respondedAt: now },
      ],
    });
    mount();
    expect(await screen.findByText("Waiting for reply")).toBeTruthy();
    expect(screen.getAllByText("Accepted")).toHaveLength(2);
    expect(screen.getByText("Declined")).toBeTruthy();
    expect(screen.getByRole("link", { name: "karan@example.com" }).getAttribute("href")).toBe("mailto:karan@example.com");
    // An alum who shared their WhatsApp number: opens a chat, not mail.
    expect(screen.getByRole("link", { name: "+919876543210" }).getAttribute("href")).toBe("https://wa.me/919876543210");
    expect(screen.getAllByText(/Contact shared/)).toHaveLength(1);
    expect(get).toHaveBeenCalledWith("/v1/contact-requests/sent", expect.anything());
  });

  it("has an empty state", async () => {
    get.mockResolvedValue({ requests: [] });
    mount();
    expect(await screen.findByText("You haven’t sent any notes yet.")).toBeTruthy();
  });
});

describe("replyStatsLine", () => {
  it("formats counts and days", () => {
    expect(replyStatsLine({ total: 5, replied: 4, medianDays: 2 })).toBe("Replied to 4 of 5 notes · usually within 2 days");
    expect(replyStatsLine({ total: 3, replied: 1, medianDays: 1 })).toBe("Replied to 1 of 3 notes · usually within 1 day");
    expect(replyStatsLine({ total: 3, replied: 0, medianDays: null })).toBe("Replied to 0 of 3 notes");
  });
});
