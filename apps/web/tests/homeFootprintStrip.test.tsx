import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { IntentcastFeedItem } from "../src/api/client";
import { HomeFootprintStrip } from "../src/components/HomeFootprintStrip";

afterEach(cleanup);

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

function post(id: string, over: Partial<IntentcastFeedItem> = {}): IntentcastFeedItem {
  return {
    id,
    authorPersonId: "me",
    authorFullName: "Me",
    authorDepartmentCode: "CSE",
    authorDepartmentName: "Computer Science",
    category: "hiring",
    content: `Post ${id}\nSome details`,
    status: "open",
    expiresAt: hoursFromNow(24 * 3 + 2),
    closedAt: null,
    createdAt: hoursFromNow(-2),
    editableUntil: hoursFromNow(-1),
    responseCount: 0,
    viewerHasResponded: false,
    ...over,
  };
}

describe("HomeFootprintStrip", () => {
  it("renders nothing when there is nothing to show", () => {
    const { container } = render(
      <HomeFootprintStrip myPosts={[]} replyCount={0} viewerPersonId="me" onOpenReplies={() => undefined} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("ignores other people's, closed and expired posts", () => {
    const { container } = render(
      <HomeFootprintStrip
        myPosts={[
          post("theirs", { authorPersonId: "other" }),
          post("closed", { status: "closed" }),
          post("expired", { expiresAt: hoursFromNow(-3) }),
        ]}
        replyCount={0}
        viewerPersonId="me"
        onOpenReplies={() => undefined}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows live posts with expiry and a replies button that opens the Replies tab", () => {
    const open = vi.fn();
    render(
      <HomeFootprintStrip
        myPosts={[post("a", { responseCount: 1 }), post("b", { expiresAt: hoursFromNow(5.5) })]}
        replyCount={2}
        viewerPersonId="me"
        onOpenReplies={open}
      />
    );
    expect(screen.getByText("Live for 3 more days")).toBeTruthy();
    expect(screen.getByText("Last call: 5 hours left").className).toContain("--soon");
    fireEvent.click(screen.getByRole("button", { name: /2 replies on your posts/ }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("caps the list at three and says how many more are still out there", () => {
    const posts = Array.from({ length: 5 }, (_, i) => post(`p${i}`));
    render(<HomeFootprintStrip myPosts={posts} replyCount={0} viewerPersonId="me" onOpenReplies={() => undefined} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("+2 more still out there")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
