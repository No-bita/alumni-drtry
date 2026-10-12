import type { HomeOpportunityCategory } from "../components/HomeOpportunityRail";

export type HomeOpportunityCategoryLegacy = HomeOpportunityCategory | "referrals" | "moving_cities";

/** Aligns legacy mock / feed category values with the chip ids used for filtering + counts */
export function normalizeHomeOpportunityCategory(cat: HomeOpportunityCategoryLegacy): Exclude<HomeOpportunityCategory, "all"> {
  switch (cat) {
    case "referrals":
      return "careers";
    case "moving_cities":
      return "relocation";
    case "careers":
    case "hiring":
    case "relocation":
    case "startups":
    case "guidance":
    case "replies":
      return cat;
    case "all":
      return "careers";
  }
}
