import { afterEach, describe, expect, it, vi } from "vitest";
import { goToLanding } from "../src/lib/goToLanding";

describe("goToLanding", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("replaces the current history entry with the site root", () => {
    const replace = vi.fn();
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, replace, assign });
    goToLanding();
    expect(replace).toHaveBeenCalledWith("/");
    expect(assign).not.toHaveBeenCalled();
  });
});
