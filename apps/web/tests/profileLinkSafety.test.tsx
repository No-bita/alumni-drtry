import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PersonProfileView } from "../src/components/profile/PersonProfileView";
import type { PublicProfileView } from "../src/api/client";
import { isWebUrl, safeWebHref } from "../src/lib/webUrl";
import { isWebUrl as isNoteWebUrl } from "../src/lib/noteForm";

/** BUG-013: only http(s) links ever become clickable on a profile (the server and database refuse the rest). */

afterEach(cleanup);

describe("safeWebHref", () => {
  it("passes web links and refuses everything else", () => {
    expect(safeWebHref(" https://example.com/me ")).toBe("https://example.com/me");
    expect(safeWebHref("http://example.com")).toBe("http://example.com");
    for (const bad of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,<script>alert(1)</script>", "mailto:a@b.com", "example.com", "", null, undefined]) {
      expect(safeWebHref(bad)).toBeNull();
    }
  });
  it("notes keep their 500-character limit", () => {
    const long = `https://example.com/${"a".repeat(600)}`;
    expect(isWebUrl(long, 2048)).toBe(true);
    expect(isNoteWebUrl(long)).toBe(false);
  });
});

describe("profile links", () => {
  const profile: PublicProfileView = { id: "p2", fullName: "Other Alum", departmentCode: "cse", departmentName: "CSE", departmentOtherText: null, departmentOtherStatus: null, batchYear: 2018, parsedJoiningYear: 2014, bio: null, residenceCountry: null, residenceCity: null };
  it("never renders a non-web link as a link", () => {
    render(
      <MemoryRouter>
        <PersonProfileView
          profile={profile}
          occupations={[]}
          links={[
            { id: "a", platform: "Website", url: "https://example.com", label: "My site" },
            { id: "b", platform: "Evil", url: "javascript:alert(1)", label: "Click me" },
            { id: "c", platform: "Data", url: "data:text/html,<script>alert(1)</script>", label: "Data link" },
          ]}
          isOwnProfile={false}
          onboardingIncomplete={false}
          openTo={null}
          onEdit={vi.fn()}
          onSignOut={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "My site" }).getAttribute("href")).toBe("https://example.com");
    expect(screen.queryByText("Click me")).toBeNull();
    expect(screen.queryByText("Data link")).toBeNull();
    expect(document.querySelectorAll('a[href^="javascript"], a[href^="data"]').length).toBe(0);
  });
});
