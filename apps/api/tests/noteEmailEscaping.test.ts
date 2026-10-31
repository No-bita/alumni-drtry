import { afterEach, expect, it, vi } from "vitest";
import { ResendEmailSender } from "../src/services/emailSender.js";
afterEach(() => vi.unstubAllGlobals());
it("escapes note text in HTML while preserving the plain-text version", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  const sender = new ResendEmailSender({ apiKey: "test-only", from: "app@example.invalid", brandName: "Alma" });
  await sender.sendContactRequestReceivedEmail({ to: "recipient@example.invalid", recipientName: "A & B", senderName: "<b>Name</b>", message: '<a href="https://example.invalid">Click</a>', lead: "asked <now>" });
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.html).toContain("A &amp; B");
  expect(body.html).toContain("&lt;b&gt;Name&lt;/b&gt;");
  expect(body.html).toContain("asked &lt;now&gt;");
  expect(body.html).not.toContain('<a href=');
  expect(body.html).toContain("&lt;a href=");
  expect(body.text).toContain('<a href="https://example.invalid">Click</a>');
});
