import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

afterEach(cleanup);
import { FormField } from "../src/components/forms/FormField";
import { FormActions } from "../src/components/forms/FormActions";

describe("forms kit FormField", () => {
  it("marks required fields with aria-required on the control, keeping the label text clean", () => {
    render(
      <FormField label="Headline" required>
        <input />
      </FormField>
    );
    const control = screen.getByLabelText("Headline");
    expect(control.getAttribute("aria-required")).toBe("true");
    // The asterisk is decorative CSS (::after), never part of the accessible label text.
    expect(screen.getByText("Headline").textContent).toBe("Headline");
  });

  it("keeps an existing aria-describedby (e.g. a character counter) when help or error text is wired", () => {
    render(
      <FormField label="Details" error="Required.">
        <textarea aria-describedby="counter-id" />
      </FormField>
    );
    const control = screen.getByLabelText("Details");
    expect(control.getAttribute("aria-describedby")).toContain("counter-id");
    expect(control.getAttribute("aria-invalid")).toBe("true");
  });

  it("points the label at the real control inside a wrapper when controlId is given", () => {
    render(
      <FormField label="Details" controlId="real-control">
        <div className="wrap">
          <textarea id="real-control" />
        </div>
      </FormField>
    );
    expect(screen.getByLabelText("Details").tagName).toBe("TEXTAREA");
  });

  it("shows errors as an alert linked to the control", () => {
    render(
      <FormField label="Role" error="Add a role title (at least 3 characters).">
        <input />
      </FormField>
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Add a role title");
    const control = screen.getByLabelText("Role");
    expect(control.getAttribute("aria-describedby")).toContain(alert.id);
  });
});

describe("forms kit FormActions", () => {
  it("renders the quiet secondary action and the primary action without submitting forms", () => {
    const clicks: string[] = [];
    render(
      <FormActions
        secondary={{ label: "Cancel", onClick: () => clicks.push("cancel") }}
        primary={{ label: "Preview", onClick: () => clicks.push("preview") }}
      />
    );
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const preview = screen.getByRole("button", { name: "Preview" });
    expect((cancel as HTMLButtonElement).type).toBe("button");
    expect((preview as HTMLButtonElement).type).toBe("button");
    cancel.click();
    preview.click();
    expect(clicks).toEqual(["cancel", "preview"]);
  });
});
