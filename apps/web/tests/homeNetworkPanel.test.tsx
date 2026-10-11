import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomeNetworkPanel } from "../src/components/HomeNetworkPanel";
import { buildInviteLink, buildWhatsAppShareUrl } from "../src/lib/inviteLink";

afterEach(cleanup);
const wrap = (members: never[] = []) =>
  render(<MemoryRouter><HomeNetworkPanel members={members} directoryHref="/search" /></MemoryRouter>);

describe("invite links", () => {
  it("points at the login page and trims slashes", () => {
    expect(buildInviteLink("https://alma.example/")).toBe("https://alma.example/login");
  });
  it("builds an encoded whatsapp url containing the link", () => {
    const u = buildWhatsAppShareUrl("https://alma.example/login");
    expect(u.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(u)).toContain("https://alma.example/login");
  });
});

describe("HomeNetworkPanel", () => {
  it("shows an honest empty state, no ghost avatars", () => {
    const { container } = wrap();
    expect(screen.getByText("0 of your batchmates are here yet")).toBeTruthy();
    expect(container.querySelector(".home-ideal__avatar-placeholder")).toBeNull();
  });
  it("invite button reveals link, copy and WhatsApp share", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    wrap();
    expect(screen.queryByLabelText("Invite link", { selector: "input" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Invite batchmates" }));
    const input = screen.getByLabelText("Invite link", { selector: "input" }) as HTMLInputElement;
    expect(input.value).toMatch(/\/login$/);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith(input.value);
    const wa = screen.getByRole("link", { name: "Share on WhatsApp" }) as HTMLAnchorElement;
    expect(wa.href.startsWith("https://wa.me/?text=")).toBe(true);
  });
});
