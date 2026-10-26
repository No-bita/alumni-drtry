import { describe, expect, it } from "vitest";
import { buildContactRequestReminderEmail } from "../src/services/emailSender.js";

describe("contact request reminder email", () => {
  it("says it is the only reminder and escapes user text in HTML", () => {
    const e = buildContactRequestReminderEmail(
      { to: "a@iitbhu.ac.in", recipientName: "Ana", senderName: "Raj <script>", message: "Hi <b>there</b> & thanks", daysWaiting: 3 },
      "Alma Mater"
    );
    expect(e.subject).toBe("Reminder: Raj <script> is waiting on your reply on Alma Mater");
    expect(e.text).toContain("sent you a note 3 days ago");
    expect(e.text).toContain("This is the only reminder we'll send for this note.");
    expect(e.html).toContain("Raj &lt;script&gt;");
    expect(e.html).toContain("Hi &lt;b&gt;there&lt;/b&gt; &amp; thanks");
    expect(e.html).not.toContain("<script>");
  });
  it("uses singular for one day", () => {
    expect(
      buildContactRequestReminderEmail({ to: "a", recipientName: "A", senderName: "B", message: "m", daysWaiting: 1 }, "X").text
    ).toContain("1 day ago");
  });
});
