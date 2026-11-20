import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const postMock = vi.hoisted(() => vi.fn());
vi.mock("../src/api/client", () => ({
  api: { post: postMock },
}));
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({
    status: "authenticated",
    person: { personId: "p1", institutionalEmail: "a@iitbhu.ac.in" },
    myProfile: { fullName: "Sample Alum", departmentCode: "CSE", batchYear: 2020 },
  }),
}));

import { PostBulletinFlow, type PostBulletinFlowHandle } from "../src/components/PostBulletinFlow";
import { PostRoleHiringFlow, type PostRoleHiringFlowHandle } from "../src/components/PostRoleHiringFlow";
import { CareerIntentFlowChrome } from "../src/components/CareerIntentFlowChrome";
import type { PostBulletinOpenOptions } from "../src/lib/bulletinFlowBindings";
import {
  WALL_TOPIC_FAMILIES,
  wallLaneToTopicFamily,
  wallTopicFamilyToUiCategory,
} from "../src/lib/wallTopics";

type Payload = { category: string; kind?: string; content: string; placeId?: string };

const TOPIC_HINT = "Choose one topic before previewing.";
const VISIBILITY = "Alma Mater community - Visible to everyone signed in to Alma Mater";
const PRIVACY = "Avoid sharing personal contact details or sensitive information in a public post.";

/** API category the composer sends for each existing UI token (unchanged storage contract). */
const API_CATEGORY_FOR_TOKEN: Record<string, string> = {
  careers: "mentorship",
  startups: "collaboration",
  relocation: "collaboration",
  guidance: "guidance",
};

function okResponse() {
  return {
    data: {
      intentcast: {
        id: "ic1",
        category: "guidance",
        content: "",
        authorPersonId: "p1",
        authorFullName: "Sample Alum",
        createdAt: new Date().toISOString(),
      },
    },
  };
}

beforeEach(() => {
  postMock.mockReset();
  postMock.mockResolvedValue(okResponse());
});
afterEach(cleanup);

function mount(options?: PostBulletinOpenOptions, onPublishSuccess = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ref = createRef<PostBulletinFlowHandle>();
  render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <PostBulletinFlow ref={ref} onPublishSuccess={onPublishSuccess} />
      </QueryClientProvider>
    </MemoryRouter>
  );
  act(() => ref.current?.open(options));
  return { ref, onPublishSuccess };
}

const titleInput = () => screen.getByLabelText(/^Title/) as HTMLInputElement;
const detailsInput = () => screen.getByLabelText(/^Details/) as HTMLTextAreaElement;
const topicRadio = (label: string) => screen.getByRole("radio", { name: label }) as HTMLInputElement;
const previewButton = () => screen.getByRole("button", { name: "Preview post" });

async function publish(name = "Publish post") {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

function lastPayload(): Payload {
  const call = postMock.mock.calls.at(-1) as unknown as [string, Payload];
  expect(call[0]).toBe("/v1/intentcasts");
  return call[1];
}

describe("Wall composer: write step", () => {
  it("shows the writing-first layout: header, static visibility line, title + details, four topic chips", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Create a post" })).toBeTruthy();
    expect(screen.getByText(VISIBILITY)).toBeTruthy();
    expect(titleInput().maxLength).toBe(120);
    expect(detailsInput().maxLength).toBe(500);
    expect(screen.getAllByRole("radio").map((r) => (r as HTMLInputElement).value)).toEqual(
      WALL_TOPIC_FAMILIES.map((f) => f.id)
    );
    for (const f of WALL_TOPIC_FAMILIES) expect(topicRadio(f.label).checked).toBe(false);
    expect(screen.getByText("You can review your post before publishing.")).toBeTruthy();
    // Removed: kind selector, category dropdown, audience selector, attachment control.
    expect(screen.queryByLabelText(/What is this/)).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByText(/attach/i)).toBeNull();
  });

  it("requires a topic before preview, with the inline hint, and keeps the draft", () => {
    mount();
    fireEvent.change(titleInput(), { target: { value: "Moving to Pune next month" } });
    fireEvent.click(previewButton());
    expect(screen.getByText(TOPIC_HINT)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Preview" })).toBeNull();
    expect(titleInput().value).toBe("Moving to Pune next month");
    fireEvent.click(topicRadio("Relocation"));
    expect(screen.queryByText(TOPIC_HINT)).toBeNull();
    fireEvent.click(previewButton());
    expect(screen.getByRole("heading", { name: "Preview" })).toBeTruthy();
    expect(postMock).not.toHaveBeenCalled();
  });

  it("shows title and topic errors inline together and focuses the title", () => {
    mount();
    fireEvent.change(titleInput(), { target: { value: "Hi" } });
    fireEvent.click(previewButton());
    const alerts = screen.getAllByRole("alert").map((a) => a.textContent);
    expect(alerts).toContain("Add a title (at least 3 characters).");
    expect(alerts).toContain(TOPIC_HINT);
    expect(titleInput().getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(titleInput());
  });

  it("caps details at 500 characters (web-side limit unchanged)", () => {
    mount();
    fireEvent.change(titleInput(), { target: { value: "A long post" } });
    fireEvent.change(detailsInput(), { target: { value: "x".repeat(501) } });
    fireEvent.click(topicRadio("Guidance"));
    fireEvent.click(previewButton());
    expect(screen.getByRole("alert").textContent).toBe("Details must be at most 500 characters.");
  });

  it("changes the details prompt with the topic (static, no analysis)", () => {
    mount();
    expect(detailsInput().placeholder).toBe("Share your perspective, question or experience to start the conversation.");
    fireEvent.click(topicRadio("Careers"));
    expect(detailsInput().placeholder).toMatch(/^What are you trying to figure out\?/);
    fireEvent.click(topicRadio("Startups"));
    expect(detailsInput().placeholder).toMatch(/^What is the opportunity, who is it for/);
    fireEvent.click(topicRadio("Relocation"));
    expect(detailsInput().placeholder).toMatch(/^Which city or neighbourhood/);
  });

  it("shows the privacy reminder only when the text contains an email or phone number", () => {
    mount();
    fireEvent.change(titleInput(), { target: { value: "Looking for a flatmate in Bengaluru" } });
    fireEvent.change(detailsInput(), { target: { value: "2BHK near HSR, budget 30k, from 1 Dec 2026." } });
    expect(screen.queryByText(PRIVACY)).toBeNull();
    fireEvent.change(detailsInput(), { target: { value: "Write to me at sample.alum@example.com" } });
    expect(screen.getByText(PRIVACY)).toBeTruthy();
    fireEvent.change(detailsInput(), { target: { value: "Call +91 98765 43210 after 6" } });
    expect(screen.getByText(PRIVACY)).toBeTruthy();
    fireEvent.change(detailsInput(), { target: { value: "See https://example.com/jobs/1234567890123" } });
    expect(screen.queryByText(PRIVACY)).toBeNull();
  });
});

describe("Wall composer: publishing", () => {
  it("accepts a title-only post and omits kind from the payload", async () => {
    const { onPublishSuccess } = mount();
    fireEvent.change(titleInput(), { target: { value: "Hi all" } });
    fireEvent.click(topicRadio("Guidance"));
    fireEvent.click(previewButton());
    expect(screen.queryByRole("alert")).toBeNull();
    await publish();
    const payload = lastPayload();
    expect(payload).toEqual({ category: "guidance", content: "[[cat:guidance]]\nHi all" });
    expect("kind" in payload).toBe(false);
    expect(onPublishSuccess).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("maps every family through the contract module and never stores hiring", async () => {
    for (const family of WALL_TOPIC_FAMILIES) {
      postMock.mockClear();
      mount();
      fireEvent.change(titleInput(), { target: { value: `Post about ${family.label}` } });
      fireEvent.click(topicRadio(family.label));
      fireEvent.click(previewButton());
      await publish();
      const token = wallTopicFamilyToUiCategory(family.id);
      const payload = lastPayload();
      expect(token).not.toBe("hiring");
      expect(payload.content.startsWith(`[[cat:${token}]]\n`)).toBe(true);
      expect(payload.category).toBe(API_CATEGORY_FOR_TOKEN[token]);
      expect(payload.category).not.toBe("hiring");
      cleanup();
    }
  });

  it("does not fold a hiring caller into Careers", () => {
    mount({ category: "hiring", headline: "We are hiring backend engineers" });
    expect(wallLaneToTopicFamily("hiring")).toBeNull();
    expect(screen.getAllByRole("radio").some((r) => (r as HTMLInputElement).checked)).toBe(false);
    fireEvent.click(previewButton());
    expect(postMock).not.toHaveBeenCalled();
  });

  it("Back from preview keeps title, details and topic", () => {
    mount();
    fireEvent.change(titleInput(), { target: { value: "Advice on moving into product" } });
    fireEvent.change(detailsInput(), { target: { value: "Five years in backend, curious about PM." } });
    fireEvent.click(topicRadio("Careers"));
    fireEvent.click(previewButton());
    const preview = screen.getByRole("heading", { name: "Preview" }).closest("section") as HTMLElement;
    expect(within(preview).getByText("Advice on moving into product")).toBeTruthy();
    expect(within(preview).getByText("Careers")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(titleInput().value).toBe("Advice on moving into product");
    expect(detailsInput().value).toBe("Five years in backend, curious about PM.");
    expect(topicRadio("Careers").checked).toBe(true);
  });

  it("keeps the draft and offers retry when publishing fails", async () => {
    postMock.mockResolvedValueOnce({ data: null, error: { code: "INTERNAL", message: "Something went wrong." } });
    const { onPublishSuccess } = mount();
    fireEvent.change(titleInput(), { target: { value: "Startup founders in Delhi?" } });
    fireEvent.change(detailsInput(), { target: { value: "Keen to meet for coffee." } });
    fireEvent.click(topicRadio("Startups"));
    fireEvent.click(previewButton());
    await publish();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Something went wrong.");
    expect(alert.textContent).toContain("Your post is still here.");
    expect(onPublishSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    expect(postMock).toHaveBeenCalledTimes(2);
    expect(lastPayload().content).toBe("[[cat:startups]]\nStartup founders in Delhi?\nKeen to meet for coffee.");
    expect(onPublishSuccess).toHaveBeenCalledOnce();
  });

  it("after a failure, Back still returns to an intact draft", async () => {
    postMock.mockResolvedValueOnce({ data: null, error: { code: "INTERNAL", message: "Network down" } });
    mount();
    fireEvent.change(titleInput(), { target: { value: "Weekend trek near Pune" } });
    fireEvent.click(topicRadio("Relocation"));
    fireEvent.click(previewButton());
    await publish();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(titleInput().value).toBe("Weekend trek near Pune");
    expect(topicRadio("Relocation").checked).toBe(true);
  });
});

describe("Wall composer: entry-point presets", () => {
  it("Cities preselects Relocation, keeps placeId, and the topic stays changeable", async () => {
    mount({ category: "relocation", placeId: "11111111-1111-4111-8111-111111111111", headline: "New in Hyderabad" });
    expect(topicRadio("Relocation").checked).toBe(true);
    expect(detailsInput().placeholder).toMatch(/^Which city or neighbourhood/);
    fireEvent.click(topicRadio("Startups"));
    expect(topicRadio("Relocation").checked).toBe(false);
    fireEvent.click(previewButton());
    await publish();
    expect(lastPayload()).toEqual({
      category: "collaboration",
      content: "[[cat:startups]]\nNew in Hyderabad",
      placeId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("legacy canHelp preset keeps Guidance and can be changed", () => {
    mount({ careersPreset: "canHelp" });
    expect(topicRadio("Guidance").checked).toBe(true);
    fireEvent.click(topicRadio("Careers"));
    expect(topicRadio("Careers").checked).toBe(true);
    expect(topicRadio("Guidance").checked).toBe(false);
  });

  it("the Wall opens with no topic chosen", () => {
    mount();
    expect(screen.getAllByRole("radio").some((r) => (r as HTMLInputElement).checked)).toBe(false);
  });

  it("referral mode keeps its guided fields, header and Careers topic", () => {
    mount({ careersPreset: "referralSeeking" });
    expect(screen.getByRole("heading", { name: "Ask for a referral" })).toBeTruthy();
    expect(screen.getByText(VISIBILITY)).toBeTruthy();
    expect(screen.getByLabelText(/Job link \*/)).toBeTruthy();
    expect(screen.getByLabelText(/^Role \*/)).toBeTruthy();
    expect(screen.getByLabelText(/Company \*/)).toBeTruthy();
    expect(screen.getByLabelText(/Why are you a fit for this role\? \*/)).toBeTruthy();
    expect(screen.getByLabelText(/Resume link \(optional\)/)).toBeTruthy();
    expect(screen.getByText("Careers")).toBeTruthy();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });
});

describe("Wall composer: referral validation unchanged", () => {
  function fill(values: Partial<Record<"job" | "role" | "company" | "fit" | "resume", string>>) {
    if (values.job !== undefined) fireEvent.change(screen.getByLabelText(/Job link/), { target: { value: values.job } });
    if (values.role !== undefined) fireEvent.change(screen.getByLabelText(/^Role/), { target: { value: values.role } });
    if (values.company !== undefined)
      fireEvent.change(screen.getByLabelText(/Company/), { target: { value: values.company } });
    if (values.fit !== undefined)
      fireEvent.change(screen.getByLabelText(/Why are you a fit/), { target: { value: values.fit } });
    if (values.resume !== undefined)
      fireEvent.change(screen.getByLabelText(/Resume link/), { target: { value: values.resume } });
  }
  const errorAfterPreview = () => {
    fireEvent.click(previewButton());
    return screen.queryByRole("alert")?.textContent ?? null;
  };

  it("runs the same checks, in the same order, with the same copy", () => {
    mount({ careersPreset: "referralSeeking" });
    expect(errorAfterPreview()).toBe("Add the job link for this opening.");
    fill({ job: "not a url !! " });
    expect(errorAfterPreview()).toBe("Job link must be a valid http(s) URL.");
    fill({ job: "https://example.com/jobs/1" });
    expect(errorAfterPreview()).toBe("Add a role title (at least 3 characters).");
    fill({ role: "Backend Engineer" });
    expect(errorAfterPreview()).toBe("Add the company for this opening.");
    fill({ company: "C".repeat(121) });
    expect(errorAfterPreview()).toBe("Company must be at most 120 characters.");
    fill({ company: "C".repeat(100) });
    expect(errorAfterPreview()).toBe(
      "Referral headline is too long (max 120 characters). Shorten the role or company."
    );
    fill({ company: "Example Co" });
    expect(errorAfterPreview()).toBe("Add why you're a fit for this role.");
    fill({ fit: "x".repeat(501) });
    expect(errorAfterPreview()).toBe("Your fit answer must be at most 500 characters.");
    fill({ fit: "Three years on this stack.", resume: "ftp://example.com/cv" });
    expect(errorAfterPreview()).toBe("Resume Link must be a valid http(s) URL.");
    fill({ resume: "" });
    expect(errorAfterPreview()).toBeNull();
    expect(screen.getByRole("heading", { name: "Preview" })).toBeTruthy();
  });

  it("keeps the combined-length guard for fit + links", () => {
    mount({ careersPreset: "referralSeeking" });
    fill({
      job: "https://example.com/jobs/123",
      role: "Backend Engineer",
      company: "Example Co",
      fit: "y".repeat(480),
    });
    expect(errorAfterPreview()).toBe(
      "Your fit answer, job link and resume link together are too long — shorten the fit answer."
    );
  });

  it("publishes the referral as Careers (mentorship) without kind", async () => {
    mount({ careersPreset: "referralSeeking" });
    fill({ job: "https://example.com/jobs/123", role: "Backend Engineer", company: "Example Co", fit: "I fit well." });
    fireEvent.click(previewButton());
    await publish("Publish");
    const payload = lastPayload();
    expect(payload.category).toBe("mentorship");
    expect(payload.content.startsWith("[[cat:careers]]\nLooking for referral for Backend Engineer at Example Co\n")).toBe(
      true
    );
    expect("kind" in payload).toBe(false);
  });
});

describe("Wall composer: closing", () => {
  it("Esc closes an empty composer straight away", () => {
    mount();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Esc with content asks before discarding; Keep editing keeps the draft", () => {
    mount();
    fireEvent.change(titleInput(), { target: { value: "Draft I care about" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(titleInput().value).toBe("Draft I care about");
    fireEvent.click(screen.getByRole("button", { name: "Close post composer" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Hiring flow regression (shared chrome)", () => {
  it("default chrome markup is unchanged from main", () => {
    const { container } = render(
      <CareerIntentFlowChrome
        ariaLabel="Hire alumni, step 1 of 2"
        onRequestClose={() => undefined}
        step="compose"
        stepsAriaLabel="Hiring flow steps"
        closeAriaLabel="Close hiring flow"
        composeStepLabel="Write"
      >
        <p>child</p>
      </CareerIntentFlowChrome>
    );
    expect(container.innerHTML).toBe(
      '<div class="career-hiring-flow__overlay" role="presentation"><section class="career-hiring-flow__dialog" role="dialog" aria-modal="true" aria-label="Hire alumni, step 1 of 2"><header class="career-hiring-flow__head"><div class="career-hiring-flow__head-title"><div><h2 class="visually-hidden">Hire alumni, step 1 of 2</h2></div></div><button type="button" class="career-hiring-flow__close" aria-label="Close hiring flow">×</button></header><div class="career-hiring-flow__steps career-hiring-flow__steps--two" aria-label="Hiring flow steps"><span class="is-active"><b>1</b><small>Write</small></span><span class=""><b>2</b><small>Preview</small></span></div><p>child</p></section></div>'
    );
  });

  it("the hiring flow still renders its own form and closes", () => {
    const qc = new QueryClient();
    const ref = createRef<PostRoleHiringFlowHandle>();
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <PostRoleHiringFlow ref={ref} />
        </QueryClientProvider>
      </MemoryRouter>
    );
    act(() => ref.current?.open());
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toBe("career-hiring-flow__dialog");
    expect(dialog.closest(".career-hiring-flow__overlay--composer")).toBeNull();
    expect(within(dialog).getByLabelText(/What is this\? \*/)).toBeTruthy();
    expect(within(dialog).getByText("Role summary *")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Preview" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close hiring flow" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
