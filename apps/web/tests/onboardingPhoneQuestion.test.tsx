import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// PHONE_QUESTION_PARKED(2026-11-05): used only by the parked original expectations below.
// import { phoneCountryForResidence } from "../src/constants/phoneCountries";
import { Onboarding } from "../src/pages/Onboarding";

const mocks = vi.hoisted(() => ({ patch: vi.fn(async () => ({})), post: vi.fn(async () => ({})), get: vi.fn(async () => ({ occupations: [] })) }));
const profile = { id: "p1", institutionalEmail: "asha.rao.cse20@itbhu.ac.in", fullName: "Asha Rao", departmentCode: "cse", degreeCode: "btech", batchYear: 2024, parsedJoiningYear: 2020, onboardingCompletedAt: null, mobilePhone: null as string | null };
const person = { personId: "p1", role: "alumni" };
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ status: "authenticated", person, myProfile: profile }) }));
vi.mock("../src/api/client", () => ({ api: { patch: mocks.patch, post: mocks.post } }));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: mocks.get }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));
vi.mock("../src/lib/betaAnalytics", () => ({ trackBetaUsageEvent: vi.fn() }));
afterEach(() => { cleanup(); profile.mobilePhone = null; vi.clearAllMocks(); });

// PHONE_QUESTION_PARKED(2026-11-05): this helper now reaches the answer-key step; the phone step no longer exists.
async function reachAnswerKey(country = "India") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<MemoryRouter><QueryClientProvider client={client}><Onboarding /></QueryClientProvider></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Start" }));
  for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole("button", { name: "OK" }));
  fireEvent.click(screen.getByRole("button", { name: /Looks right/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Other" }));
  fireEvent.click(screen.getByRole("button", { name: "OK" }));
  await screen.findByText("Please specify *");
  fireEvent.change(view.container.querySelector("input")!, { target: { value: "Consulting" } });
  fireEvent.click(screen.getByRole("button", { name: "OK" }));
  fireEvent.change(view.container.querySelector("input")!, { target: { value: country } });
  fireEvent.click(screen.getByRole("button", { name: "OK" }));
  fireEvent.change(view.container.querySelector("input")!, { target: { value: "Mumbai" } });
  fireEvent.click(screen.getByRole("button", { name: "OK" }));
  return view;
}

// PHONE_QUESTION_PARKED(2026-11-05): original phone-question expectations are preserved, commented, below these tests.
// Restore them together with the question when WhatsApp OTP verification lands (parked todo-01M6M19CJE53C865J2YH8353FV).
describe("onboarding phone question (parked behaviour)", () => {
  it("does not show the phone question after city; the answer-key step follows", async () => {
    await reachAnswerKey();
    expect(screen.queryByText("What is your mobile number?")).toBeNull();
    expect(screen.queryByLabelText("Country code")).toBeNull();
    expect(screen.queryByLabelText("Mobile number", { selector: "input" })).toBeNull();
    expect(screen.getByText("What can you help juniors with?")).toBeTruthy();
  });
  it("finishing sends no mobilePhone, so an existing stored number stays untouched", async () => {
    profile.mobilePhone = "+91 9876543210";
    await reachAnswerKey();
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith("/v1/me/profile", expect.objectContaining({ markMinimumProfileComplete: true }))
    );
    for (const call of mocks.patch.mock.calls) {
      expect(JSON.stringify(call[1]).includes("mobilePhone")).toBe(false);
    }
  });
  it("completes onboarding without a phone answer", async () => {
    await reachAnswerKey();
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith("/v1/me/profile", expect.objectContaining({ markOnboardingComplete: true }))
    );
  });
});

// PHONE_QUESTION_PARKED(2026-11-05): ORIGINAL EXPECTATIONS (parked, do not run) - restore with the question.
// describe("combined onboarding phone question (parked)", () => {
//   it("shows code and number together after city, without another question", async () => {
//     await reachPhone();
//     expect(screen.getByText("What is your mobile number?")).toBeTruthy();
//     expect((screen.getByLabelText("Country code") as HTMLSelectElement).value).toBe("IN");
//     expect(screen.getByLabelText("Mobile number", { selector: "input" })).toBeTruthy();
//     expect(screen.queryByText("What is your country code?")).toBeNull();
//     // Answer-key and past-roles steps follow, so the phone step advances with "OK".
//     expect(screen.getByRole("button", { name: "OK" })).toBeTruthy();
//     fireEvent.click(screen.getByRole("button", { name: "Back" }));
//     expect(screen.getByText("What is your current city of residence?")).toBeTruthy();
//   });
//   it("leaves an unknown residence unselected rather than assuming a country", async () => {
//     await reachPhone("Unlisted place");
//     expect((screen.getByLabelText("Country code") as HTMLSelectElement).value).toBe("");
//   });
//   it("maps trimmed country names and ISO codes without fuzzy guesses", () => {
//     expect(phoneCountryForResidence(" india ")?.callingCode).toBe("+91");
//     expect(phoneCountryForResidence("GB")?.callingCode).toBe("+44");
//     expect(phoneCountryForResidence("United States")?.callingCode).toBe("+1");
//     expect(phoneCountryForResidence("ind" )).toBeUndefined();
//   });
//   it("preserves an existing phone prefix instead of replacing it with residence", async () => {
//     profile.mobilePhone = "+44 1234567890";
//     await reachPhone();
//     expect((screen.getByLabelText("Country code") as HTMLSelectElement).value).toBe("saved:+44");
//     expect((screen.getByLabelText("Mobile number", { selector: "input" }) as HTMLInputElement).value).toBe("1234567890");
//   });
//   it("refreshes an untouched preselection after changing residence on Back", async () => {
//     const view = await reachPhone();
//     fireEvent.click(screen.getByRole("button", { name: "Back" }));
//     fireEvent.click(screen.getByRole("button", { name: "Back" }));
//     fireEvent.change(view.container.querySelector("input")!, { target: { value: "United Kingdom" } });
//     fireEvent.click(screen.getByRole("button", { name: "OK" }));
//     fireEvent.click(screen.getByRole("button", { name: "OK" }));
//     expect((screen.getByLabelText("Country code") as HTMLSelectElement).value).toBe("GB");
//   });
//   it("retains a manual country choice on Back and saves the same phone string format", async () => {
//     await reachPhone();
//     fireEvent.change(screen.getByLabelText("Country code"), { target: { value: "GB" } });
//     fireEvent.click(screen.getByRole("button", { name: "Back" }));
//     fireEvent.click(screen.getByRole("button", { name: "OK" }));
//     expect((screen.getByLabelText("Country code") as HTMLSelectElement).value).toBe("GB");
//     fireEvent.change(screen.getByLabelText("Mobile number", { selector: "input" }), { target: { value: "1234567890" } });
//     fireEvent.click(screen.getByRole("button", { name: "OK" }));
//     fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
//     fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
//     await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("/v1/me/profile", expect.objectContaining({ mobilePhone: "+44 1234567890" })));
//   });
//   it("keeps code and number required and retains ten-digit validation", async () => {
//     await reachPhone();
//     fireEvent.change(screen.getByLabelText("Country code"), { target: { value: "" } });
//     fireEvent.click(screen.getByRole("button", { name: "OK" }));
//     expect(screen.getByText("Please enter your country code.")).toBeTruthy();
//     fireEvent.change(screen.getByLabelText("Country code"), { target: { value: "IN" } });
//     fireEvent.click(screen.getByRole("button", { name: "OK" }));
//     expect(screen.getByText("Please enter your mobile number.")).toBeTruthy();
//     fireEvent.change(screen.getByLabelText("Mobile number", { selector: "input" }), { target: { value: "123" } });
//     fireEvent.click(screen.getByRole("button", { name: "OK" }));
//     expect(screen.getByText("Please enter a valid 10-digit mobile number.")).toBeTruthy();
//     expect(mocks.patch.mock.calls.filter(c => JSON.stringify(c).includes("mobilePhone"))).toHaveLength(0);
//   });
// });
