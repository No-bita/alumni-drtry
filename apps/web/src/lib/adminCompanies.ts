import { api } from "../api/client";

/** GET /v1/admin/orgs/pending (oldest first). Admin-only route: the creator's full email is included. */
export type PendingCompany = {
  id: string;
  name: string;
  createdAt: string;
  createdByEmailMasked: string | null;
  createdByEmail: string | null;
  /** The name as first typed, once an admin has renamed it. */
  submittedName?: string | null;
};

/** GET /v1/admin/orgs/approved: approved companies that aren't linked to another. */
export type ApprovedCompanyOption = { id: string; name: string };

/** GET /v1/admin/orgs/approved/all: a row in the "Approved companies" section. */
export type ApprovedCompanyRow = {
  id: string;
  name: string;
  submittedName: string | null;
  linkedTo: { id: string; name: string } | null;
  linkedNames: number;
};

/** Who already has a name the admin tried to rename to, and the main company to link to instead (if any). */
export type NameTaken = {
  id: string;
  name: string;
  status: "approved" | "linked" | "pending" | "rejected";
  linkedToName: string | null;
  linkTo: ApprovedCompanyOption | null;
};

export type RenameResult = { result: "renamed"; organization: { id: string; name: string; submittedName: string | null } } | { result: "taken"; existing: NameTaken };

/** Most rows the approved section shows (the API's maximum). */
export const APPROVED_LIST_MAX = 50;
export const COMPANY_NAME_MAX = 120;

/** The pending list is read in one go, up to the API's maximum. */
export const PENDING_LIMIT = 200;

export const PENDING_COMPANIES_KEY = ["admin", "orgs", "pending"] as const;
export const approvedCompaniesKey = (q: string) => ["admin", "orgs", "approved", q] as const;
export const approvedListKey = (q: string) => ["admin", "orgs", "approvedList", q] as const;
/** Everything on Company review: refetch after any change. */
export const ADMIN_ORGS_KEY = ["admin", "orgs"] as const;

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

export async function fetchApprovedList(q: string, signal?: AbortSignal): Promise<ApprovedCompanyRow[]> {
  const { data, error } = await api.get<{ organizations: ApprovedCompanyRow[] }>(
    `/v1/admin/orgs/approved/all?q=${encodeURIComponent(q.trim())}`,
    { signal },
  );
  if (error || !data) throw new AdminCompanyError(error?.code ?? "UNKNOWN", error?.message ?? "Couldn't load approved companies.");
  return data.organizations;
}

/** Edit name. A taken name changes nothing and comes back as `{ result: "taken" }`. */
export async function renameCompany(id: string, name: string): Promise<RenameResult> {
  const { data, error } = await api.patch<RenameResult>(`/v1/admin/orgs/${id}/name`, { name });
  if (error || !data) throw new AdminCompanyError(error?.code ?? "UNKNOWN", error?.message ?? "That didn't go through. Try again.");
  return data;
}

/** Reject a pending company with a reason the submitter will see on their profile. Nothing is deleted. */
export async function rejectCompany(id: string, reason: string): Promise<void> {
  const { error } = await api.delete(`/v1/admin/orgs/${id}`, { reason });
  if (error) throw new AdminCompanyError(error.code, error.message ?? "That didn't go through. Try again.");
}

/** "Same company as…" for an approved company. Names linked to it move along. */
export async function linkApprovedCompany(id: string, toId: string): Promise<{ movedLinkedNames: number }> {
  const { data, error } = await api.patch<{ movedLinkedNames: number }>(`/v1/admin/orgs/${id}/link`, { canonicalOrganizationId: toId });
  if (error || !data) throw new AdminCompanyError(error?.code ?? "UNKNOWN", error?.message ?? "That didn't go through. Try again.");
  return { movedLinkedNames: data.movedLinkedNames ?? 0 };
}

/** Why the new name can't be used, in plain words. */
export function takenMessage(t: NameTaken): string {
  if (t.status === "approved") return `‘${t.name}’ already exists.`;
  if (t.status === "linked") return `‘${t.name}’ already exists, linked to ‘${t.linkedToName ?? "another company"}’.`;
  if (t.status === "pending") return `Another name waiting for review is already called ‘${t.name}’. Review that one first, or pick another name.`;
  return `‘${t.name}’ was rejected earlier, so that name can't be used. Pick another name.`;
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
  if (code === "ORG_NAME_UNCHANGED") return { message: "That's already its name.", refreshList: false };
  if (code === "ORG_REJECT_REASON_REQUIRED") return { message: "Give a reason (at least 3 characters).", refreshList: false };
  if (code === "ORG_INVALID_NAME") return { message: `Company names are 2 to ${COMPANY_NAME_MAX} characters.`, refreshList: false };
  if (code === "ORG_REJECTED" || code === "ORG_NOT_APPROVED") {
    return { message: "This company's review status changed. Refreshing the list.", refreshList: true };
  }
  if (code === "AUTH_FORBIDDEN") return { message: "This needs an admin account.", refreshList: false };
  return { message: err instanceof Error && err.message ? err.message : "That didn't go through. Try again.", refreshList: false };
}

export function formatAddedDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
