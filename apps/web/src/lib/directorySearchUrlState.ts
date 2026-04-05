import { DIRECTORY_KEYWORD_MAX_LENGTH } from "../constants/directorySearch";

export type DirectorySearchDraft = {
  q: string;
  batch: number | null;
  dept: string | null;
  company: string | null;
  occ: string | null;
  residenceCountry: string | null;
  residenceCity: string | null;
};

export const EMPTY_DIRECTORY_SEARCH_DRAFT: DirectorySearchDraft = {
  q: "",
  batch: null,
  dept: null,
  company: null,
  occ: null,
  residenceCountry: null,
  residenceCity: null,
};

export function parseDirectorySearchFromParams(sp: URLSearchParams): DirectorySearchDraft {
  const batchRaw = sp.get("batch");
  const batchParsed = batchRaw != null ? parseInt(batchRaw, 10) : NaN;
  return {
    q: sp.get("q") ?? "",
    batch: batchRaw != null && !Number.isNaN(batchParsed) ? batchParsed : null,
    dept: sp.get("dept"),
    company: sp.get("company"),
    occ: sp.get("occ"),
    residenceCountry: sp.get("residenceCountry"),
    residenceCity: sp.get("residenceCity"),
  };
}

/** Builds query params for GET /v1/search (no limit/cursor). */
export function buildSearchParamsFromDraft(d: DirectorySearchDraft): URLSearchParams {
  const p = new URLSearchParams();
  if (d.batch != null) p.set("batch", String(d.batch));
  if (d.dept) p.set("dept", d.dept);
  if (d.company) p.set("company", d.company);
  if (d.occ) p.set("occ", d.occ);
  if (d.residenceCountry) p.set("residenceCountry", d.residenceCountry);
  if (d.residenceCity) p.set("residenceCity", d.residenceCity);
  const kw = d.q.trim().slice(0, DIRECTORY_KEYWORD_MAX_LENGTH);
  if (kw) p.set("q", kw);
  return p;
}

export function normalizeQ(q: string): string {
  return q.trim().slice(0, DIRECTORY_KEYWORD_MAX_LENGTH);
}

export function draftsEqual(a: DirectorySearchDraft, b: DirectorySearchDraft): boolean {
  return (
    normalizeQ(a.q) === normalizeQ(b.q) &&
    a.batch === b.batch &&
    (a.dept ?? "") === (b.dept ?? "") &&
    (a.company ?? "") === (b.company ?? "") &&
    (a.occ ?? "") === (b.occ ?? "") &&
    (a.residenceCountry ?? "") === (b.residenceCountry ?? "") &&
    (a.residenceCity ?? "") === (b.residenceCity ?? "")
  );
}

export function draftMatchesUrl(draft: DirectorySearchDraft, sp: URLSearchParams): boolean {
  return draftsEqual(draft, parseDirectorySearchFromParams(sp));
}

/** Counts structured filters only (not keyword). */
export function countDirectoryFilterParams(d: DirectorySearchDraft): number {
  let n = 0;
  if (d.batch != null) n++;
  if (d.dept) n++;
  if (d.company) n++;
  if (d.occ) n++;
  if (d.residenceCountry) n++;
  if (d.residenceCity) n++;
  return n;
}
