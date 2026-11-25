import { isWebUrl } from "./noteForm";
import type { ExperienceBand, JobFunction } from "./jobFunctions";

/** Careers → Hiring in the Wall composer: the tapped answers and how they become the post. */
export type HiringWhere = "my_city" | "remote" | "hybrid" | "other";

export type HiringDraft = {
  jobFunction: JobFunction | null;
  roleTitle: string;
  experience: ExperienceBand | null;
  where: HiringWhere | null;
  otherCity: string;
  company: string;
  /** True once the member edited the company (so the prefill doesn't overwrite it). */
  companyTouched: boolean;
  respondVia: "reachout" | "link" | null;
  applyUrl: string;
  body: string;
  askPrivately: boolean;
};

export const HIRING_BODY_MIN = 10;
export const HIRING_BODY_MAX = 1500;
export const HIRING_SHORT_MAX = 120;
const SHORT_MAX = HIRING_SHORT_MAX;

export function emptyHiringDraft(): HiringDraft {
  return {
    jobFunction: null,
    roleTitle: "",
    experience: null,
    where: null,
    otherCity: "",
    company: "",
    companyTouched: false,
    respondVia: null,
    applyUrl: "",
    body: "",
    askPrivately: false,
  };
}

/** The location stored on the post, from the tap (and the typed city for "Other city"). */
export function hiringLocation(d: HiringDraft, myCity: string | null): string | null {
  switch (d.where) {
    case "my_city":
      return myCity;
    case "remote":
      return "Remote";
    case "hybrid":
      return myCity ? `Hybrid · ${myCity}` : "Hybrid";
    case "other":
      return d.otherCity.trim() || null;
    default:
      return null;
  }
}

/** What still stops the hiring post (empty when it's ready). Function, experience and how to respond are required. */
export function hiringProblems(d: HiringDraft): string[] {
  const out: string[] = [];
  if (!d.jobFunction) out.push("function");
  if (!d.experience) out.push("experience");
  if (!d.respondVia) out.push("how to respond");
  if (d.respondVia === "link" && !isWebUrl(d.applyUrl.trim())) out.push("apply link");
  if (d.roleTitle.trim().length > SHORT_MAX) out.push("role title");
  if (d.company.trim().length > SHORT_MAX) out.push("company");
  const b = d.body.trim().length;
  if (b < HIRING_BODY_MIN || b > HIRING_BODY_MAX) out.push("details");
  return out;
}

/** The API payload's `hiring` object. */
export function hiringPayload(d: HiringDraft, myCity: string | null) {
  return {
    jobFunction: d.jobFunction!,
    roleTitle: d.roleTitle.trim() || null,
    experience: d.experience!,
    location: hiringLocation(d, myCity),
    company: d.company.trim() || null,
    respondVia: d.respondVia!,
    applyUrl: d.respondVia === "link" ? d.applyUrl.trim() : null,
  };
}
