import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useBulletinComposeState } from "../src/components/useBulletinComposeState";

describe("useBulletinComposeState", () => {
  it("opens compose with reset fields", () => {
    const { result } = renderHook(() => useBulletinComposeState({ maxLength: 1000 }));

    act(() => {
      result.current.setHiringCompany("ACME");
      result.current.setPostError("previous");
      result.current.openCompose();
    });

    expect(result.current.postOpen).toBe(true);
    expect(result.current.hiringCompany).toBe("");
    expect(result.current.postError).toBeNull();
  });

  it("validates url and required fields", () => {
    const { result } = renderHook(() => useBulletinComposeState({ maxLength: 1000 }));

    act(() => {
      result.current.setHiringCompany("ACME");
      result.current.setHiringTitle("Engineer");
      result.current.setHiringLocation("Bengaluru");
      result.current.setHiringTrackChoice("hiring");
      result.current.setHiringExperience("3");
      result.current.setHiringRoleSummary("Work on product quality.");
      result.current.setHiringApplySteps("Share CV.");
      result.current.setHiringJdUrl("ftp://bad-url");
    });

    expect(result.current.validatePostInput()).toBe("Enter a valid URL (http:// or https://).");
  });

  it("accepts valid structured compose input", () => {
    const { result } = renderHook(() => useBulletinComposeState({ maxLength: 1000 }));

    act(() => {
      result.current.setHiringCompany("ACME");
      result.current.setHiringTitle("Engineer");
      result.current.setHiringLocation("Bengaluru");
      result.current.setHiringTrackChoice("hiring");
      result.current.setHiringExperience("3");
      result.current.setHiringRoleSummary("Work on product quality.");
      result.current.setHiringApplySteps("Share CV + LinkedIn.");
      result.current.setHiringJdUrl("https://jobs.example.com/role");
    });

    expect(result.current.validatePostInput()).toBeNull();
    expect(result.current.hiringComposeBody).toContain("ACME");
    expect(result.current.hiringPreviewBody).toContain("Engineer");
  });
});
