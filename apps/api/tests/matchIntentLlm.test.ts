import { describe, expect, it } from "vitest";
import { parseQuestionWithLlm, type MatchIntentLlmProvider } from "../src/lib/matchIntentLlm.js";

const valid = {
  category: "referral",
  company: "Razorpay",
  role: "Product Manager",
  fromRole: null,
  city: null,
  country: null,
  studyPrograms: [],
  keywords: []
};

describe("parseQuestionWithLlm", () => {
  it("accepts schema-valid output and marks the source", async () => {
    const provider: MatchIntentLlmProvider = { extractIntent: async () => valid };
    expect(await parseQuestionWithLlm(provider, "q")).toEqual({ ...valid, source: "llm" });
  });

  it("returns null for invalid or extra fields (caller falls back to rules)", async () => {
    const bad: MatchIntentLlmProvider = { extractIntent: async () => ({ ...valid, category: "supplier" }) };
    const extra: MatchIntentLlmProvider = { extractIntent: async () => ({ ...valid, whyThem: "made up" }) };
    expect(await parseQuestionWithLlm(bad, "q")).toBeNull();
    expect(await parseQuestionWithLlm(extra, "q")).toBeNull();
  });

  it("returns null on errors and on timeout", async () => {
    const throws: MatchIntentLlmProvider = {
      extractIntent: async () => {
        throw new Error("boom");
      }
    };
    const slow: MatchIntentLlmProvider = {
      extractIntent: (_q, signal) =>
        new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))))
    };
    expect(await parseQuestionWithLlm(throws, "q")).toBeNull();
    expect(await parseQuestionWithLlm(slow, "q", 20)).toBeNull();
  });
});
