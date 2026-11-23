import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const getMock = vi.hoisted(() => vi.fn());
const postMock = vi.hoisted(() => vi.fn());
vi.mock("../src/api/client", () => ({ api: { get: getMock, post: postMock } }));
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({
    status: "authenticated",
    person: { personId: "p1", institutionalEmail: "a@iitbhu.ac.in" },
    myProfile: { fullName: "Sample Alum", departmentCode: "CSE", batchYear: 2025 },
  }),
}));

import { PostAudienceField, PostAudienceLabel } from "../src/components/PostAudienceField";
import { PostBulletinFlow, type PostBulletinFlowHandle } from "../src/components/PostBulletinFlow";
import {
  EVERYONE_CHOICE,
  audienceSizeLine,
  choiceLabel,
  toApiAudience,
  unavailableText,
  type AudienceChoice,
  type AudienceOptions,
} from "../src/lib/postAudience";

const OPTIONS: AudienceOptions = {
  institutions: [
    { key: "iit-bhu-varanasi", name: "IIT (BHU) Varanasi" },
    { key: "iit-bombay", name: "IIT Bombay" },
    { key: "iim-ahmedabad", name: "IIM Ahmedabad" },
  ],
  ownInstitutionKey: "iit-bhu-varanasi",
  batch: { available: true, value: "2025", reason: null },
  department: { available: false, value: null, reason: "pending_review" },
  city: { available: true, value: "Bengaluru", reason: null },
};

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  getMock.mockImplementation(async (path: string) =>
    path === "/v1/intentcasts/audience-options" ? { data: OPTIONS } : { error: { code: "NOT_FOUND" } }
  );
  postMock.mockImplementation(async (path: string, body: { audience: Partial<AudienceChoice> | null }) => {
    if (path === "/v1/intentcasts/audience-preview") {
      const a = body.audience ?? {};
      if (a.batch && a.city) return { data: { everyone: false, label: "2025 batch · Bengaluru", size: "none" } };
      if (a.city) return { data: { everyone: false, label: "Bengaluru", size: "under10" } };
      return { data: { everyone: false, label: "IIT Bombay", size: "about", approx: 40 } };
    }
    return { data: { intentcast: { id: "new-post" } } };
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Harness({ onState }: { onState?: (s: { label: string | null; blocked: boolean }) => void }) {
  const [v, setV] = useState<AudienceChoice>({ ...EVERYONE_CHOICE });
  return (
    <QueryClientProvider client={client()}>
      <PostAudienceField value={v} onChange={setV} onStateChange={onState} />
      <output data-testid="value">{JSON.stringify(toApiAudience(v))}</output>
    </QueryClientProvider>
  );
}

describe("audience helpers", () => {
  it("Everyone sends nothing; picks send only what is picked (never values)", () => {
    expect(toApiAudience(EVERYONE_CHOICE)).toBeNull();
    expect(toApiAudience({ institution: "iit-bombay", batch: true, department: false, city: false })).toEqual({
      institution: "iit-bombay",
      batch: true,
    });
  });
  it("builds the label from the author's own values", () => {
    expect(choiceLabel(EVERYONE_CHOICE, OPTIONS)).toBe("Everyone on Alma Mater");
    expect(choiceLabel({ institution: "iit-bombay", batch: true, department: false, city: true }, OPTIONS)).toBe(
      "IIT Bombay · 2025 batch · Bengaluru"
    );
  });
  it("size lines never show an exact count, and zero blocks", () => {
    expect(audienceSizeLine(undefined, true)?.text).toBe("All members can see this.");
    expect(audienceSizeLine({ everyone: false, label: "x", size: "about", approx: 40 }, false)?.text).toBe("About 40 people can see this.");
    expect(audienceSizeLine({ everyone: false, label: "x", size: "under10" }, false)?.tone).toBe("warn");
    expect(audienceSizeLine({ everyone: false, label: "x", size: "none" }, false)?.tone).toBe("block");
  });
  it("explains each unavailable detail", () => {
    expect(unavailableText("department", "pending_review")).toMatch(/waiting for review/);
    expect(unavailableText("city", "city_not_linked")).toMatch(/isn't linked/);
    expect(unavailableText("batch", "missing")).toMatch(/batch year/);
  });
});

describe("Who can see this", () => {
  it("defaults to Everyone with All institutes selected", async () => {
    render(<Harness />);
    expect(screen.getByText("Everyone on Alma Mater")).toBeTruthy();
    expect(screen.getByText("All members can see this.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Everyone on Alma Mater/ }));
    const select = (await screen.findByLabelText("Institute")) as HTMLSelectElement;
    await waitFor(() => expect(select.disabled).toBe(false));
    expect(select.value).toBe("");
    expect(select.options[0]!.textContent).toBe("All institutes");
    // Own institute listed first and marked.
    expect(select.options[1]!.textContent).toBe("IIT (BHU) Varanasi (yours)");
    expect(screen.getByText("You can't change this after posting.")).toBeTruthy();
  });

  it("any institute can be picked; the size comes back rounded", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Everyone on Alma Mater/ }));
    const select = (await screen.findByLabelText("Institute")) as HTMLSelectElement;
    await waitFor(() => expect(select.disabled).toBe(false));
    fireEvent.change(select, { target: { value: "iit-bombay" } });
    expect(screen.getByTestId("value").textContent).toBe('{"institution":"iit-bombay"}');
    expect(await screen.findByText("About 40 people can see this.")).toBeTruthy();
    expect(postMock).toHaveBeenCalledWith("/v1/intentcasts/audience-preview", { audience: { institution: "iit-bombay" } });
  });

  it("shows the author's own values, and disables what they can't use with the reason", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Everyone on Alma Mater/ }));
    expect(await screen.findByText("2025")).toBeTruthy();
    expect(screen.getByText("Bengaluru")).toBeTruthy();
    const dept = screen.getByRole("checkbox", { name: /Department/ }) as HTMLInputElement;
    expect(dept.disabled).toBe(true);
    expect(screen.getByText(/Your department is waiting for review/)).toBeTruthy();
  });

  it("warns on a small audience and reports blocked when no one matches", async () => {
    const states: Array<{ label: string | null; blocked: boolean }> = [];
    render(<Harness onState={(s) => states.push(s)} />);
    fireEvent.click(screen.getByRole("button", { name: /Everyone on Alma Mater/ }));
    const city = (await screen.findByRole("checkbox", { name: /City/ })) as HTMLInputElement;
    await waitFor(() => expect(city.disabled).toBe(false));
    fireEvent.click(city);
    expect(await screen.findByText(/Fewer than 10 people can see this/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Batch/ }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/nobody would see your post/);
    await waitFor(() => expect(states.at(-1)).toEqual({ label: "2025 batch · Bengaluru", blocked: true }));
  });

  it("if the choices can't load, says so and leaves the post for everyone", async () => {
    getMock.mockResolvedValue({ error: { code: "NETWORK_ERROR" } });
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Everyone on Alma Mater/ }));
    expect(await screen.findByText(/Couldn't load the audience choices/)).toBeTruthy();
    expect(screen.getByTestId("value").textContent).toBe("null");
  });
});

describe("composer integration", () => {
  function mountComposer() {
    const ref = createRef<PostBulletinFlowHandle>();
    render(
      <MemoryRouter>
        <QueryClientProvider client={client()}>
          <PostBulletinFlow ref={ref} />
        </QueryClientProvider>
      </MemoryRouter>
    );
    act(() => ref.current?.open({ careersPreset: "referralSeeking" }));
    return ref;
  }
  function fillReferral() {
    fireEvent.change(screen.getByLabelText(/What is this/), { target: { value: "ask" } });
    fireEvent.change(screen.getByLabelText(/Job link/), { target: { value: "https://example.com/jobs/123" } });
    fireEvent.change(screen.getByLabelText(/^Role/), { target: { value: "Backend Engineer" } });
    fireEvent.change(screen.getByLabelText(/Company/), { target: { value: "Example Co" } });
    fireEvent.change(screen.getByLabelText(/Why are you a fit for this role/), {
      target: { value: "Three years building APIs on the same stack this team uses." },
    });
  }

  it("every composer has the picker; publishing sends the audience, and Everyone sends none", async () => {
    mountComposer();
    fillReferral();
    fireEvent.click(screen.getByRole("button", { name: /Everyone on Alma Mater/ }));
    const select = (await screen.findByLabelText("Institute")) as HTMLSelectElement;
    await waitFor(() => expect(select.disabled).toBe(false));
    fireEvent.change(select, { target: { value: "iit-bombay" } });
    await screen.findByText("About 40 people can see this.");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByText("Visible to: IIT Bombay")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Post|Publish|Ask/ }));
    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/v1/intentcasts", expect.objectContaining({ audience: { institution: "iit-bombay" } }))
    );
  });

  it("blocks Preview while no one matches", async () => {
    mountComposer();
    fillReferral();
    fireEvent.click(screen.getByRole("button", { name: /Everyone on Alma Mater/ }));
    const city = (await screen.findByRole("checkbox", { name: /City/ })) as HTMLInputElement;
    await waitFor(() => expect(city.disabled).toBe(false));
    fireEvent.click(city);
    fireEvent.click(screen.getByRole("checkbox", { name: /Batch/ }));
    await screen.findByText(/nobody would see your post/);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByText(/No one else matches this audience yet/)).toBeTruthy();
    expect(postMock.mock.calls.some((c) => c[0] === "/v1/intentcasts")).toBe(false);
  });

  it("city-page composition defaults to the page city, sends its ID and resets elsewhere", async () => {
    const ref = mountComposer();
    act(() => ref.current?.open({ category: "relocation", placeId: "pune-id", placeName: "Pune", headline: "Housing in Pune" }));
    expect(await screen.findByRole("button", { name: /Pune/ })).toBeTruthy();
    expect(screen.getByText("15 / 120")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Headline/), { target: { value: "A flat in Pune" } });
    expect(screen.getByText("14 / 120")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Details/), { target: { value: "Looking for one room in a shared flat." } });
    await waitFor(() => expect(postMock).toHaveBeenCalledWith("/v1/intentcasts/audience-preview", { audience: { city: true, cityPlaceId: "pune-id" } }));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(postMock).toHaveBeenCalledWith("/v1/intentcasts", expect.objectContaining({ placeId: "pune-id", audience: { city: true, cityPlaceId: "pune-id" } })));
    act(() => ref.current?.open());
    expect(screen.getByText("Everyone on Alma Mater")).toBeTruthy();
  });

  it("shows photo advice only for the housing shortcut, never as post content", () => {
    const ref = mountComposer();
    expect(screen.queryByText("Have photos to share?")).toBeNull();
    act(() => ref.current?.open({ category: "relocation", housingPhotoTip: true }));
    expect(screen.getByText("Have photos to share?")).toBeTruthy();
    expect((screen.getByLabelText(/Details/) as HTMLTextAreaElement).value).toBe("");
    act(() => ref.current?.close());
    act(() => ref.current?.open({ category: "relocation" }));
    expect(screen.queryByText("Have photos to share?")).toBeNull();
  });

  it("does not send an old city target when the city restriction is removed", () => {
    expect(toApiAudience({ ...EVERYONE_CHOICE, cityPlaceId: "pune-id" })).toBeNull();
    expect(toApiAudience({ ...EVERYONE_CHOICE, batch: true, cityPlaceId: "pune-id" })).toEqual({ batch: true });
  });

  it("reopening the composer starts from Everyone again", async () => {
    const ref = mountComposer();
    fireEvent.click(screen.getByRole("button", { name: /Everyone on Alma Mater/ }));
    const select = (await screen.findByLabelText("Institute")) as HTMLSelectElement;
    await waitFor(() => expect(select.disabled).toBe(false));
    fireEvent.change(select, { target: { value: "iit-bombay" } });
    act(() => ref.current?.close());
    act(() => ref.current?.open({ careersPreset: "referralSeeking" }));
    expect(await screen.findByText("Everyone on Alma Mater")).toBeTruthy();
  });
});

describe("labels", () => {
  it("the label component renders nothing without a label", () => {
    const { container } = render(<PostAudienceLabel label={null} />);
    expect(container.textContent).toBe("");
  });
});

describe("activity rows", () => {
  it("carry the audience label from the post", async () => {
    const { mapIntentcastToRow } = await import("../src/lib/careerFeedRow");
    const item = {
      id: "i1",
      authorPersonId: "a",
      authorFullName: "Sample Alum",
      authorDepartmentCode: null,
      authorDepartmentName: null,
      category: "collaboration",
      kind: "ask",
      content: "Looking for a flatmate near HSR\nMoving in January.",
      status: "open",
      expiresAt: "2026-12-01T00:00:00Z",
      closedAt: null,
      createdAt: "2026-11-21T00:00:00Z",
      editableUntil: "2026-11-21T00:05:00Z",
      responseCount: 0,
      viewerHasResponded: false,
    } as const;
    expect(mapIntentcastToRow({ ...item, audience: { label: "IIT (BHU) Varanasi · Bengaluru", parts: ["institution", "city"] } })?.audienceLabel).toBe(
      "IIT (BHU) Varanasi · Bengaluru"
    );
    expect(mapIntentcastToRow({ ...item, audience: null })?.audienceLabel).toBeNull();
  });
});
