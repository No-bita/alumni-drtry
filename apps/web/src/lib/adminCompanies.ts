import { api } from "../api/client";

/** GET /v1/admin/orgs/pending (oldest first). The creator's email arrives masked from the API. */
export type PendingCompany = {
  id: string;
  name: string;
  createdAt: string;
  createdByEmailMasked: string | null;
};

/** GET /v1/admin/orgs/approved: approved companies that aren't linked to another. */
export type ApprovedCompanyOption = { id: string; name: string };

/** The pending list is read in one go, up to the API's maximum. */
export const PENDING_LIMIT = 200;

export const PENDING_COMPANIES_KEY = ["admin", "orgs", "pending"] as const;
export const approvedCompaniesKey = (q: string) => ["admin", "orgs", "approved", q] as const;

export class AdminCompanyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function fetchPendingCompanies(signal?: AbortSignal): Promise<PendingCompany[]> {
  const { data, error } = await api.get<{ organizations: PendingCompany[] }>(`/v1/admin/orgs/pending?limit=${PENDING_LIMIT}`, { signal });
  if (error || !data) throw new AdminCompanyError(error?.code ?? "UNKNOWN", error?.message ?? "Couldn't load the companies.");
  return data.organizations;
}

export async function searchApprovedCompanies(q: string, signal?: AbortSignal): Promise<ApprovedCompanyOption[]> {
  const { data, error } = await api.get<{ organizations: ApprovedCompanyOption[] }>(
    `/v1/admin/orgs/approved?q=${encodeURIComponent(q.trim())}`,
    { signal },
  );
  if (error || !data) throw new AdminCompanyError(error?.code ?? "UNKNOWN", error?.message ?? "Couldn't search companies.");
  return data.organizations;
}

/** Approve as its own company, or (with a main company's id) as the same company as that one. */
export async function reviewCompany(id: string, sameAsId: string | null): Promise<void> {
  const { error } = await api.patch(`/v1/admin/orgs/${id}`, sameAsId ? { canonicalOrganizationId: sameAsId } : {});
  if (error) throw new AdminCompanyError(error.code, error.message ?? "That didn't go through. Try again.");
}

/** What to tell the admin when an approve / link fails. */
export function reviewErrorMessage(err: unknown): { message: string; refreshList: boolean } {
  const code = err instanceof AdminCompanyError ? err.code : "UNKNOWN";
  if (code === "ORG_NOT_PENDING" || code === "ORG_NOT_FOUND") {
    return { message: "Already reviewed. Refreshing the list.", refreshList: true };
  }
  if (code === "ORG_INVALID_CANONICAL") {
    return { message: "That company can't be chosen any more. Search again and pick another.", refreshList: false };
  }
  if (code === "AUTH_FORBIDDEN") return { message: "This needs an admin account.", refreshList: false };
  return { message: err instanceof Error && err.message ? err.message : "That didn't go through. Try again.", refreshList: false };
}

export function formatAddedDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
