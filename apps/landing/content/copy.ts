// Static page copy, taken verbatim from the landing page spec (sections 5.1 to 5.10, 7).
// The OG image and favicon are file-based metadata: app/opengraph-image.png and app/icon.svg.

// Live platform entry point. Every landing CTA opens the main platform's login page.
export const PLATFORM_URL = "https://app.almamater.aaryanshah.co.in/login";

export const copy = {
  nav: {
    wordmark: "ALMA MATER",
    badge: "CENTRE: IIT (BHU) · NOW LIVE",
    forAlumniLink: "For alumni",
    joinButton: "Open Alma Mater",
  },

  hero: {
    eyebrowTemplate: "{USE CASE}",
    primaryCta: "OPEN ALMA MATER",
    secondaryCta: "I’m an alum. I want to help.",
    stamp: ["LIFE IS UNFAIR.", "USE YOUR UNFAIR ADVANTAGE."],
    cardHeaderTemplate: "ALUMNI ADMIT CARD · MATCH FOR: {USE CASE}",
    searching: "Matching your question to an alum…",
    illustrativeCaption: "Illustrative example",
    cardFields: {
      name: "NAME",
      batchBranch: "BATCH · BRANCH",
      currently: "CURRENTLY",
      whyThem: "WHY THEM",
      reachOut: "REACH OUT",
    },
  },

  gap: {
    heading: "NOTE TO CANDIDATES",
    body: "Most people never use their alumni network.",
    followUp: "Not because alumni won’t help. Because nobody knows which one can.",
    contrastLeft: "An alumni directory: 1,000s of names. Now what?",
    contrastRight: "Alma Mater: the one alum who’s done what you need",
  },

  howItWorks: {
    heading: "INSTRUCTIONS TO CANDIDATES",
    steps: [
      {
        n: 1,
        title: "Write your question.",
        body: "Tell us what you’re trying to get done, in plain words.",
      },
      {
        n: 2,
        title: "Get matched.",
        body: "We find the alum who’s already done it, and show you why they’re the right one.",
      },
      {
        n: 3,
        title: "Reach out.",
        body: "Ask for help from someone who shares your campus.",
      },
    ],
  },

  forAlumni: {
    anchorId: "for-alumni",
    heading: "BE SOMEONE’S ANSWER KEY.",
    body: "Somewhere on campus, someone is stuck on a question you’ve already answered. Alma Mater sends them to you, only for the things you choose to help with.",
    sampleTags: ["Happy to refer", "Open to mentoring", "Open to business"],
    cta: "Join as an alum",
  },

  buildTogether: {
    heading: "YOUR NEXT DEAL MIGHT BE WITH AN ALUM.",
    body: "Shared campus means shared trust. That means less vetting, faster deals, and no middlemen.",
    cards: ["First customer", "Supplier", "Co-founder"],
    stamp: "TRUSTED: SAME CAMPUS.",
  },

  examCentres: {
    items: ["IIT (BHU) — LIVE", "OTHER IITs — NEXT", "IIMs — AFTER THAT"],
  },

  footer: {
    wordmark: "ALMA MATER",
    tagline: "Made for alumni, by an alum.",
    contactEmail: "aaryan@aaryanshah.co.in",
  },

  seo: {
    title: "Alma Mater — Find the alum who can help",
    description:
      "Tell us what you need. We’ll find the alum who’s already done it. Now live for IIT (BHU).",
  },
} as const;
