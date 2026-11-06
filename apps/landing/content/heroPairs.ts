// Hero pain/solution pairs and their fictional placeholder alumni (spec 5.2).
// Edit copy here; components only read from this file.
// All alumni below are fictional. The UI must show an "Illustrative example" caption.

export type HeroPair = {
  id: number;
  useCase: string;
  pill: string;
  headline: string;
  subhead: string;
  alum: {
    name: string;
    batchBranch: string;
    currently: string;
    whyThem: string;
    tags: [string, string];
  };
};

export const HERO_PAIR_COUNT = 6;

export const heroPairs: readonly HeroPair[] = [
  {
    id: 1,
    useCase: "Referral",
    pill: "Referral",
    headline: "No one to refer you at your dream company?",
    subhead: "Someone from your college works there. Alma Mater finds them.",
    alum: {
      name: "Ananya Rao",
      batchBranch: "Batch of ’16 · Electrical",
      currently: "Senior Product Manager, consumer fintech",
      whyThem:
        "Works at the company you’re applying to and has referred juniors before.",
      tags: ["Open to referrals", "Payments team"],
    },
  },
  {
    id: 2,
    useCase: "Interview prep",
    pill: "Interview prep",
    headline: "Interview next week, no one to prep you?",
    subhead: "An alum cleared that exact interview. We’ll find them.",
    alum: {
      name: "Karan Mehta",
      batchBranch: "Batch of ’19 · Computer Science",
      currently: "Product Manager, e-commerce marketplace",
      whyThem: "Cleared the same PM interview loop last year.",
      tags: ["Mock interviews", "PM case prep"],
    },
  },
  {
    id: 3,
    useCase: "First customer",
    pill: "First customer",
    headline: "Your first customer is out there. Somewhere.",
    subhead: "One of them went to your college. We’ll tell you who.",
    alum: {
      name: "Ritika Sharma",
      batchBranch: "Batch of ’13 · Chemical",
      currently: "Head of Procurement, D2C beauty brand",
      whyThem: "Buys the kind of tool you’re building, and decides on it.",
      tags: ["Decision maker", "Open to demos"],
    },
  },
  {
    id: 4,
    useCase: "Co-founder",
    pill: "Co-founder",
    headline: "Can’t find a co-founder you can trust?",
    subhead: "You shared a campus with them. We’ll find who.",
    alum: {
      name: "Aditya Verma",
      batchBranch: "Batch of ’14 · Mechanical",
      currently: "Second-time founder",
      whyThem: "Wants to build again in climate tech and needs a technical partner.",
      tags: ["Looking to co-found", "Climate tech"],
    },
  },
  {
    id: 5,
    useCase: "Supplier",
    pill: "Supplier",
    headline: "Paying a middleman’s margin?",
    subhead: "Your supplier could be an alum. We’ll find them.",
    alum: {
      name: "Vikram Singh",
      batchBranch: "Batch of ’11 · Metallurgy",
      currently: "Runs a packaging manufacturing unit",
      whyThem: "Supplies D2C brands directly, without a distributor in between.",
      tags: ["Direct supply", "Open to alumni deals"],
    },
  },
  {
    id: 6,
    useCase: "Relocation",
    pill: "Relocation",
    headline: "Moving to a new city alone?",
    subhead: "Alumni already live there. We’ll find them.",
    alum: {
      name: "Neha Iyer",
      batchBranch: "Batch of ’18 · Mathematics & Computing",
      currently: "Data Scientist, Berlin",
      whyThem: "Moved to Berlin two years ago and helps newcomers settle in.",
      tags: ["Lives in Berlin", "Housing tips"],
    },
  },
];
