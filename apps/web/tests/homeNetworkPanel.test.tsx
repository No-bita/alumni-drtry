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

const member = (id: string) =>
  ({ id, fullName: `Batchmate ${id}`, batchYear: 2020, departmentCode: "cse" }) as never;

describe("HomeNetworkPanel", () => {
  it("with no confirmed count: invite-first card, no zero count, no avatars, no directory link", () => {
    const { container } = wrap();
    expect(screen.getByRole("heading", { name: "Bring your batchmates here" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Invite batchmates" })).toBeTruthy();
    expect(screen.queryByText(/0 of your batchmates/)).toBeNull();
    expect(screen.queryByText(/of your batchmates is here/)).toBeNull();
    expect(container.querySelector(".home-ideal__avatars")).toBeNull();
    expect(screen.queryByRole("link", { name: "View all alumni" })).toBeNull();
  });
  it("count-free card reveals link, copy and WhatsApp share", () => {
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
  it("titles the section with the batch count once someone is here", () => {
    render(
      <MemoryRouter>
        <HomeNetworkPanel members={[member("a")]} directoryHref="/search" countLabel="1" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "1 of your batchmates is here" })).toBeTruthy();
    cleanup();
    render(
      <MemoryRouter>
        <HomeNetworkPanel members={[member("a"), member("b")]} directoryHref="/search" countLabel="40+" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "40+ of your batchmates are here" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Invite batchmates" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View all alumni" })).toBeTruthy();
    expect(document.querySelector(".home-ideal__avatars")).toBeNull();
  });
});
