import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StagingMarker } from "../src/components/StagingMarker";
import { isStagingDeployment } from "../src/lib/stagingEnvironment";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("staging build boundary", () => {
  it.each([
    ["preview", "staging", true],
    ["production", "staging", false],
    ["production", "main", false],
    ["preview", "main", false],
    ["preview", "feat/staging-environment-marker", false],
    ["development", "staging", false],
    [undefined, "staging", false],
    ["preview", undefined, false],
    [undefined, undefined, false],
  ])("%s / %s -> %s", (environment, branch, expected) => {
    expect(isStagingDeployment(environment, branch)).toBe(expected);
  });
  it("marks staging and restores the DOM after unmount (including StrictMode remounts)", () => {
    vi.stubGlobal("__ALMA_STAGING__", true);
    document.title = "Alma Mater";
    const view = render(<StagingMarker />);
    expect(screen.getByRole("note").textContent).toBe("STAGING · Test data");
    expect(document.title).toBe("[STAGING] Alma Mater");
    expect(document.documentElement.dataset.almaEnvironment).toBe("staging");
    view.unmount();
    expect(document.title).toBe("Alma Mater");
    expect(document.documentElement.dataset.almaEnvironment).toBeUndefined();
  });
  it("leaves production and other previews unchanged", () => {
    vi.stubGlobal("__ALMA_STAGING__", false);
    document.title = "Alma Mater";
    render(<StagingMarker />);
    expect(screen.queryByRole("note")).toBeNull();
    expect(document.title).toBe("Alma Mater");
    expect(document.documentElement.dataset.almaEnvironment).toBeUndefined();
  });
});
