/** Valid note-form payloads for tests (referral or advice, fields long enough to pass the rules). */
export function referralNote(overrides: Record<string, unknown> = {}) {
  return {
    purpose: "referral",
    jobUrl: "https://jobs.example.com/pm",
    role: "Product Manager",
    company: "Example Co",
    fit: "Two years as a product analyst on the payments team, where I shipped the refunds flow end to end.",
    ...overrides,
  };
}

export function adviceNote(overrides: Record<string, unknown> = {}) {
  return {
    purpose: "advice",
    topic: "interview_prep",
    question: "I have a product interview at your company next week. What does the product round focus on, and how did you prepare?",
    ...overrides,
  };
}
