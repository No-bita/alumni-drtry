import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiPost = vi.hoisted(() => vi.fn());
vi.mock("../src/api/client", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  api: { get: vi.fn(), post: apiPost },
}));

import { FeedbackDialog } from "../src/components/FeedbackDialog";

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <FeedbackDialog onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

afterEach(cleanup);

describe("FeedbackDialog", () => {
  it("says private, never anonymous, and needs a message", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Feedback" })).toBeTruthy();
    expect(screen.getByText("Your feedback is private.")).toBeTruthy();
    expect(document.body.textContent?.toLowerCase()).not.toContain("anonymous");
    expect((screen.getByRole("button", { name: "Send feedback" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("submits the trimmed message and confirms", async () => {
    apiPost.mockResolvedValue({ data: { feedback: { id: "f1", createdAt: "2026-11-22T00:00:00Z" } } });
    renderDialog();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Loving the new forms  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    await waitFor(() => expect(screen.getByText("Feedback sent")).toBeTruthy());
    expect(apiPost).toHaveBeenCalledWith("/v1/feedback", { message: "Loving the new forms" });
  });

  it("shows the server error and keeps the draft", async () => {
    apiPost.mockResolvedValue({ error: { code: "FEEDBACK_BAD_REQUEST", message: "Nope." } });
    renderDialog();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Still here" } });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Nope."));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Still here");
  });
});
