import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProfileHero } from "../src/components/profile/ProfileHero";

afterEach(cleanup);

describe("Profile More options", () => {
  it("bounds the ellipsis icon while keeping the share menu available", () => {
    render(
      <MemoryRouter>
        <ProfileHero
          loading={false}
          profile={null}
          occupations={[]}
          links={[]}
          profileDisplayName="Sample Alum"
          isOwnProfile={false}
        />
      </MemoryRouter>,
    );
    const trigger = screen.getByLabelText("More options");
    const icon = trigger.querySelector("svg");
    expect(icon?.getAttribute("width")).toBe("20");
    expect(icon?.getAttribute("height")).toBe("20");
    fireEvent.click(trigger);
    expect(trigger.parentElement?.hasAttribute("open")).toBe(true);
    expect(screen.getByRole("menuitem", { name: "Share profile" })).toBeTruthy();
  });
});
