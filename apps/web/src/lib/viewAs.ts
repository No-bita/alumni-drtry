import { api, setViewAsReadOnly, VIEW_AS_END_API_PATH, VIEW_AS_SWITCH_API_PATH, type ViewAsInfo } from "../api/client";
import { APP_BASE_PATH } from "./appBase";

/** Admin "view as member" (testing only). The API decides who may use it; see docs/api-contracts.md. */

export type ViewAsPerson = {
  personId: string;
  fullName: string | null;
  institutionalEmail: string;
  batchYear: number | null;
  departmentCode: string | null;
  role: "alumni" | "admin" | "super_admin";
  suspended: boolean;
};

/** "priya@iitbhu.ac.in · ’19 · CSE · Admin" under a member's name in search results. */
export function viewAsPersonLine(p: ViewAsPerson): string {
  return [
    p.institutionalEmail,
    p.batchYear ? `’${String(p.batchYear).slice(2)}` : null,
    p.departmentCode ? p.departmentCode.toUpperCase() : null,
    p.role !== "alumni" ? (p.role === "super_admin" ? "Super admin" : "Admin") : null,
    p.suspended ? "Suspended" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export const VIEW_AS_SEARCH_MIN = 2;
export const viewAsPeopleKey = (q: string) => ["admin", "view-as", "people", q] as const;

export class ViewAsError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function fail(error: { code?: string; message?: string } | undefined, fallback: string): never {
  throw new ViewAsError(error?.code ?? "UNKNOWN", error?.message ?? fallback);
}

/** Name to show for the viewed member (their email when they have no name yet). */
export function viewAsName(info: Pick<ViewAsInfo, "targetName" | "targetEmail">): string {
  return info.targetName?.trim() || info.targetEmail;
}

export async function searchViewAsPeople(q: string, signal?: AbortSignal): Promise<ViewAsPerson[]> {
  const params = new URLSearchParams({ q: q.trim() });
  const { data, error } = await api.get<{ people: ViewAsPerson[] }>(`/v1/admin/view-as/people?${params.toString()}`, { signal });
  if (error || !data) fail(error, "Couldn't search members.");
  return data.people;
}

export async function startViewAs(personId: string): Promise<ViewAsInfo> {
  const { data, error } = await api.post<{ viewAs: ViewAsInfo }>("/v1/admin/view-as", { personId });
  if (error || !data) fail(error, "Couldn't start viewing as this member.");
  return data.viewAs;
}

/** Go straight to another member: ends the current view-as (if any) and starts this one, in one step. */
export async function switchViewAs(personId: string): Promise<ViewAsInfo> {
  const { data, error } = await api.post<{ viewAs: ViewAsInfo }>(VIEW_AS_SWITCH_API_PATH, { personId });
  if (error || !data) fail(error, "Couldn't switch to this member.");
  return data.viewAs;
}

export async function endViewAs(): Promise<void> {
  const { error } = await api.post(VIEW_AS_END_API_PATH);
  if (error) fail(error, "Couldn't exit view-as. Try again.");
  setViewAsReadOnly(false);
}

/**
 * Switching identity (start or exit) reloads the app at `path`, so no cached data, open form or page
 * state from one account is ever shown as the other's.
 */
export function reloadAppAt(path: string): void {
  window.location.assign(`${APP_BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`);
}
