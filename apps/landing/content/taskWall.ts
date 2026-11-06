// "Question paper" task wall (spec 5.4). Edit questions here, not in components.

export type TaskQuestion = { n: number; text: string };
export type TaskSection = {
  id: "A" | "B" | "C";
  title: string;
  questions: readonly TaskQuestion[];
};

export const taskWallCopy = {
  heading: "WHAT CAN AN ALUM HELP YOU WITH?",
  subheading: "More than you think.",
  hoverStamp: "THERE’S AN ALUM FOR THIS.",
} as const;

export const taskWall: readonly TaskSection[] = [
  {
    id: "A",
    title: "Section A · Career",
    questions: [
      { n: 1, text: "Get a referral at a company you’re targeting." },
      { n: 2, text: "Prep for a specific interview." },
      { n: 3, text: "Choose between two offers." },
      { n: 4, text: "Switch from engineering to product." },
    ],
  },
  {
    id: "B",
    title: "Section B · Life",
    questions: [
      { n: 5, text: "Decide between an MS and an MBA." },
      { n: 6, text: "Settle into a new city." },
      { n: 7, text: "Find a flat or flatmates." },
      { n: 8, text: "Plan studying abroad." },
    ],
  },
  {
    id: "C",
    title: "Section C · Business",
    questions: [
      { n: 9, text: "Find your first customer." },
      { n: 10, text: "Find a co-founder you trust." },
      { n: 11, text: "Source a supplier without a middleman." },
      { n: 12, text: "Pitch to alumni who invest." },
    ],
  },
];
