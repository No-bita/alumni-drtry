import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CareersFeedback } from "../src/components/CareersFeedback";
import { readFileSync } from "node:fs";

afterEach(cleanup);
describe("approved Careers feedback", () => {
  it("keeps the confirmation and dismiss action with status semantics", () => {
    const dismiss = vi.fn();
    render(<CareersFeedback tone="success"><span>Role published. It's now under Roles from alumni.</span><button onClick={dismiss}>Dismiss</button></CareersFeedback>);
    expect(screen.getByRole("status").textContent).toContain("Role published. It's now under Roles from alumni.");
    expect(screen.getByRole("status").querySelector('[aria-hidden="true"]')?.textContent).toBe("✓");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(dismiss).toHaveBeenCalledOnce();
  });
  it.each(["Couldn't load companies.", "Couldn't load alumni at A long company name."])("keeps alert and retry: %s", (message) => {
    const retry = vi.fn();
    render(<CareersFeedback tone="error">{message}<button onClick={retry}>Try again</button></CareersFeedback>);
    expect(screen.getByRole("alert").textContent).toContain(message);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it("integrates exactly three approved sites without styling neutral states", () => {
    const page = readFileSync("src/pages/CareerPage.tsx", "utf8");
    const company = readFileSync("src/pages/CareerCompanyPage.tsx", "utf8");
    expect((page.match(/<CareersFeedback /g) ?? []).length).toBe(2);
    expect((company.match(/<CareersFeedback /g) ?? []).length).toBe(1);
    expect(page).toContain('<p className="careers__note" role="status">');
    expect(company).toContain('<p className="careers__note" role="status">');
    expect(page).toContain('setNotice("Role published. It\'s now under Roles from alumni.")');
    expect(page).toContain('onClick={() => void companies.refetch()}');
    expect(company).toContain('onClick={() => void query.refetch()}');
  });
});
