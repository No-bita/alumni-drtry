import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInviteLink, buildInviteMessage, buildWhatsAppShareUrl, copyText } from "../src/lib/inviteLink";

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
});

describe("invite link builders", () => {
  it("points at the login page and strips trailing slashes", () => {
    expect(buildInviteLink("https://alma.example")).toBe("https://alma.example/login");
    expect(buildInviteLink("https://alma.example///")).toBe("https://alma.example/login");
  });
  it("puts the link in the message", () => {
    expect(buildInviteMessage("https://a/login")).toContain("https://a/login");
  });
  it("encodes the whole message for WhatsApp", () => {
    const url = buildWhatsAppShareUrl("https://a.test/login?x=1&y=2");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(url).not.toMatch(/ /);
    const decoded = decodeURIComponent(url.slice("https://wa.me/?text=".length));
    expect(decoded).toBe(buildInviteMessage("https://a.test/login?x=1&y=2"));
  });
});

describe("copyText", () => {
  it("uses the clipboard API when it works", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    expect(await copyText("hi")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hi");
  });
  it("falls back to execCommand when the clipboard API rejects", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("no")) }, configurable: true });
    document.execCommand = vi.fn().mockReturnValue(true);
    expect(await copyText("hi")).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });
  it("returns false when both routes fail", async () => {
    document.execCommand = vi.fn().mockReturnValue(false);
    expect(await copyText("hi")).toBe(false);
    document.execCommand = vi.fn(() => {
      throw new Error("nope");
    });
    expect(await copyText("hi")).toBe(false);
  });
});
