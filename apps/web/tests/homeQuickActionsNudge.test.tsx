import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomeQuickActionCards } from "../src/components/HomeQuickActions";
import { readFileSync } from "node:fs";

afterEach(cleanup);
const actions = [
  { id: "directory", title: "Find alumni", href: "/search" },
  { id: "bulletin", title: "Share", onActivate: () => {} },
];

describe("share card nudge", () => {
  it("marks only the nudged card", () => {
    const { container } = render(
      <MemoryRouter><HomeQuickActionCards actions={actions} nudgeActionId="bulletin" /></MemoryRouter>,
    );
    expect(container.querySelectorAll(".home-ideal__quick-action-card--nudge")).toHaveLength(1);
    expect(container.querySelector(".home-ideal__quick-action-card--bulletin.home-ideal__quick-action-card--nudge")).not.toBeNull();
  });
  it("marks nothing without a nudge id", () => {
    const { container } = render(
      <MemoryRouter><HomeQuickActionCards actions={actions} /></MemoryRouter>,
    );
    expect(container.querySelector(".home-ideal__quick-action-card--nudge")).toBeNull();
  });
  it("ships a visible pulse and honours reduced motion", () => {
    const css = readFileSync("src/styles/home-nudge.css", "utf8");
    expect(css).toMatch(/homeQuickActionNudgePulse/);
    expect(css).toMatch(/prefers-reduced-motion: reduce/);
  });
});
