import { api } from "../api/client";

/** GET /v1/admin/department-other/review: one member's typed "Other" department awaiting review. */
export type DepartmentOtherSubmission = {
  personId: string;
  fullName: string;
  institutionalEmail: string;
  batchYear: number | null;
  departmentOtherText: string;
  status: "pending" | "rejected";
  rejectionReason: string | null;
  updatedAt: string;
};

export type DepartmentOption = { id: string; code: string; name: string };

export type DepartmentOtherHistoryEntry = {
  id: string;
  personId: string;
  personName: string | null;
  action: "submitted" | "approved" | "rejected" | "linked";
  actorName: string | null;
  submittedText: string | null;
  targetDepartmentName: string | null;
  reason: string | null;
  at: string;
};

export type ReviewTab = "pending" | "rejected";

export const REJECT_REASON_MAX = 500;

export const reviewKey = (tab: ReviewTab, q: string) => ["admin", "department-other", "review", tab, q] as const;
export const departmentsKey = ["admin", "department-other", "departments"] as const;
export const historyKey = (personId: string | null) => ["admin", "department-other", "history", personId ?? "all"] as const;

export class AdminDepartmentOtherError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function fail(error: { code?: string; message?: string } | undefined, fallback: string): never {
  throw new AdminDepartmentOtherError(error?.code ?? "UNKNOWN", error?.message ?? fallback);
}

// The API returns snake_case rows; normalize once here.
interface RawSubmission {
  person_id: string;
  full_name: string;
  institutional_email: string;
  batch_year: number | null;
  department_other_text: string;
  department_other_status: "pending" | "rejected";
  department_other_rejection_reason: string | null;
  updated_at: string;
}

interface RawHistory {
  id: string;
  person_id: string;
  person_name: string | null;
  action: "submitted" | "approved" | "rejected" | "linked";
  actor_name: string | null;
  submitted_text: string | null;
  target_department_name: string | null;
  reason: string | null;
  created_at: string;
}

function mapSubmission(r: RawSubmission): DepartmentOtherSubmission {
  return {
    personId: r.person_id,
    fullName: r.full_name,
    institutionalEmail: r.institutional_email,
    batchYear: r.batch_year,
    departmentOtherText: r.department_other_text,
    status: r.department_other_status,
    rejectionReason: r.department_other_rejection_reason,
    updatedAt: r.updated_at,
  };
}

function mapHistory(r: RawHistory): DepartmentOtherHistoryEntry {
  return {
    id: r.id,
    personId: r.person_id,
    personName: r.person_name,
    action: r.action,
    actorName: r.actor_name,
    submittedText: r.submitted_text,
    targetDepartmentName: r.target_department_name,
    reason: r.reason,
    at: r.created_at,
  };
}

export async function fetchReviewQueue(tab: ReviewTab, q: string, signal?: AbortSignal): Promise<DepartmentOtherSubmission[]> {
  const params = new URLSearchParams({ status: tab });
  if (q.trim()) params.set("q", q.trim());
  const { data, error } = await api.get<{ submissions: RawSubmission[] }>(`/v1/admin/department-other/review?${params.toString()}`, { signal });
  if (error || !data) fail(error, "Couldn't load the review queue.");
  return data.submissions.map(mapSubmission);
}

export async function fetchDepartments(signal?: AbortSignal): Promise<DepartmentOption[]> {
  const { data, error } = await api.get<{ departments: DepartmentOption[] }>(`/v1/admin/department-other/departments`, { signal });
  if (error || !data) fail(error, "Couldn't load departments.");
  return data.departments;
}

export async function fetchHistory(personId: string | null, signal?: AbortSignal): Promise<DepartmentOtherHistoryEntry[]> {
  const url = personId ? `/v1/admin/department-other/${personId}/history` : `/v1/admin/department-other/history?limit=25`;
  const { data, error } = await api.get<{ history: RawHistory[] }>(url, { signal });
  if (error || !data) fail(error, "Couldn't load the history.");
  return data.history.map(mapHistory);
}

export async function approveSubmission(personId: string, expectedText: string): Promise<void> {
  const { error } = await api.post(`/v1/admin/department-other/${personId}/approve`, { expectedText });
  if (error) fail(error, "That didn't go through. Try again.");
}

export async function rejectSubmission(personId: string, reason: string, expectedText: string): Promise<void> {
  const { error } = await api.post(`/v1/admin/department-other/${personId}/reject`, { reason, expectedText });
  if (error) fail(error, "That didn't go through. Try again.");
}

export async function linkSubmission(personId: string, departmentId: string, expectedText: string): Promise<void> {
  const { error } = await api.post(`/v1/admin/department-other/${personId}/link`, { departmentId, expectedText });
  if (error) fail(error, "That didn't go through. Try again.");
}

export function historySummary(h: DepartmentOtherHistoryEntry): string {
  switch (h.action) {
    case "submitted":
      return `Submitted "${h.submittedText ?? ""}"`;
    case "approved":
      return `Approved "${h.submittedText ?? ""}"`;
    case "rejected":
      return `Rejected "${h.submittedText ?? ""}"${h.reason ? `: ${h.reason}` : ""}`;
    case "linked":
      return `Linked to ${h.targetDepartmentName ?? "a department"}`;
  }
}

/** What to tell the admin when an action fails. */
export function reviewErrorMessage(err: unknown): { message: string; refresh: boolean } {
  const code = err instanceof AdminDepartmentOtherError ? err.code : "UNKNOWN";
  if (code === "DEPARTMENT_OTHER_NOT_FOUND") {
    return { message: "This submission no longer exists. Refreshing the list.", refresh: true };
  }
  if (code === "DEPARTMENT_OTHER_CHANGED") {
    return { message: "The member changed this text, so it was not approved. Review the updated text.", refresh: true };
  }
  if (code === "DEPARTMENT_OTHER_REJECT_REASON_REQUIRED") {
    return { message: `Give a reason (up to ${REJECT_REASON_MAX} characters).`, refresh: false };
  }
  if (code === "AUTH_FORBIDDEN") return { message: "This needs an admin account.", refresh: false };
  return { message: err instanceof Error && err.message ? err.message : "That didn't go through. Try again.", refresh: false };
}

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
