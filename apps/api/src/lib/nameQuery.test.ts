import { describe, expect, it } from "vitest";
import { namePhrase, namePrefixWords, nameWords } from "./nameQuery.js";

describe("nameQuery", () => {
  it("splits on anything that is not a letter or digit", () => {
    expect(nameWords("  A.K. Sharma-Rao ")).toEqual(["a", "k", "sharma", "rao"]);
    expect(namePhrase("Could Ananya  Rao help?")).toBe("could ananya rao help");
  });

  it("treats short text as a name to prefix-match", () => {
    expect(namePrefixWords("Ananya")).toEqual(["ananya"]);
    expect(namePrefixWords("anan ra")).toEqual(["anan", "ra"]);
  });

  it("does not prefix-match long questions, one-letter words, two-letter-only text or numbers", () => {
    expect(namePrefixWords("need a referral at razorpay please")).toBeNull();
    expect(namePrefixWords("a sharma")).toBeNull();
    expect(namePrefixWords("pm ai")).toBeNull();
    expect(namePrefixWords("2016")).toBeNull();
    expect(namePrefixWords("   ")).toBeNull();
  });
});
