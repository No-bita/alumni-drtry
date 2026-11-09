import { api } from "../api/client";

export type AnnouncementChannels = "in_app" | "email" | "both";

export type AnnouncementFilters = {
  batchYears?: number[];
  departmentCodes?: string[];
  placeIds?: string[];
};

export type AnnouncementContent = {
  title: string;
  body: string;
  linkPath: string | null;
  channels: AnnouncementChannels;
};

export type AudiencePreview = {
  count: number;
  sample: Array<{ personId: string; fullName: string | null; batchYear: number | null; departmentCode: string | null }>;
};

export type AnnouncementSummary = {
  id: string;
  title: string;
  channels: AnnouncementChannels;
  status: "sending" | "sent" | "partially_failed" | "draft";
  isTest: boolean;
  recipientCount: number;
  createdAt: string;
  completedAt: string | null;
  sender: { personId: string | null; name: string | null };
  filters: { batchYears: number[]; departmentCodes: string[]; places: Array<{ id: string; label: string }> };
  email: { queued: number; sent: number; failed: number; skippedOptedOut: number };
};

export type AnnouncementDetail = AnnouncementSummary & {
  body: string;
  linkPath: string | null;
  inApp: { delivered: number; seen: number };
};

export type CityOption = { id: string; label: string };

export const TITLE_MAX = 120;
export const BODY_MAX = 2000;
export const BATCH_MIN = 1960;
export const CITY_NOTE = "Only members linked to a city record. Many members aren't linked yet.";

export const CHANNEL_LABELS: Record<AnnouncementChannels, string> = {
  in_app: "In-app",
  email: "Email",
  both: "Email and In-app",
};

export const announcementsKey = ["admin", "announcements"] as const;
export const historyKey = [...announcementsKey, "history"] as const;
export const detailKey = (id: string) => [...announcementsKey, "detail", id] as const;
export const previewKey = (filters: AnnouncementFilters) => [...announcementsKey, "preview", filters] as const;

export class AnnouncementError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function fail(error: { code?: string; message?: string } | undefined, fallback: string): never {
  throw new AnnouncementError(error?.code ?? "UNKNOWN", error?.message ?? fallback);
}

/** Filters as sent to the API: empty lists dropped (empty = everyone). */
export function cleanFilters(f: AnnouncementFilters): AnnouncementFilters {
  const out: AnnouncementFilters = {};
  if (f.batchYears && f.batchYears.length > 0) out.batchYears = [...new Set(f.batchYears)].sort((a, b) => a - b);
  if (f.departmentCodes && f.departmentCodes.length > 0) out.departmentCodes = [...new Set(f.departmentCodes)];
  if (f.placeIds && f.placeIds.length > 0) out.placeIds = [...new Set(f.placeIds)];
  return out;
}

/** Every year from..to inclusive (either end alone = that one year). Null when the range is invalid. */
export function batchRange(fromText: string, toText: string, maxYear: number): number[] | null {
  const parse = (t: string) => (t.trim() === "" ? null : Number(t.trim()));
  let from = parse(fromText);
  let to = parse(toText);
  if (from === null && to === null) return [];
  if (from === null) from = to;
  if (to === null) to = from;
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
  if (from! < BATCH_MIN || to! > maxYear || from! > to!) return null;
  const years: number[] = [];
  for (let y = from!; y <= to!; y += 1) years.push(y);
  return years;
}

/** "In-app" / "Email" / "Email and In-app" for the confirm question. */
export function confirmQuestion(count: number, channels: AnnouncementChannels): string {
  return `Send to ${count.toLocaleString("en-IN")} ${count === 1 ? "member" : "members"} by ${CHANNEL_LABELS[channels]}?`;
}

/** Plain-language audience summary for history rows. */
export function filtersSummary(f: AnnouncementSummary["filters"], departmentLabel: (code: string) => string): string {
  const parts: string[] = [];
  if (f.batchYears.length > 0) {
    const ys = [...f.batchYears].sort((a, b) => a - b);
    const contiguous = ys.every((y, i) => i === 0 || y === ys[i - 1]! + 1);
    parts.push(ys.length === 1 ? `Batch ${ys[0]}` : contiguous ? `Batch ${ys[0]}–${ys[ys.length - 1]}` : `Batch ${ys.join(", ")}`);
  }
  if (f.departmentCodes.length > 0) parts.push(f.departmentCodes.map(departmentLabel).join(", "));
  if (f.places.length > 0) parts.push(f.places.map((p) => p.label).join(", "));
  return parts.length > 0 ? parts.join(" · ") : "All members";
}

export function statusLabel(a: Pick<AnnouncementSummary, "status" | "email" | "channels">): string {
  if (a.status === "sending") return a.email.queued > 0 ? `Sending (${a.email.queued} emails left)` : "Sending";
  if (a.status === "partially_failed") return `Sent, ${a.email.failed} ${a.email.failed === 1 ? "email" : "emails"} failed`;
  return "Sent";
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export async function previewAudience(filters: AnnouncementFilters, signal?: AbortSignal): Promise<AudiencePreview> {
  const { data, error } = await api.post<AudiencePreview>("/v1/admin/announcements/preview", { filters: cleanFilters(filters) }, { signal });
  if (error || !data) fail(error, "Couldn't count members.");
  return data;
}

export async function sendTestAnnouncement(content: AnnouncementContent): Promise<AnnouncementDetail> {
  const { data, error } = await api.post<{ announcement: AnnouncementDetail }>("/v1/admin/announcements/test", content);
  if (error || !data) fail(error, "Couldn't send the test.");
  return data.announcement;
}

export async function sendAnnouncement(
  content: AnnouncementContent,
  filters: AnnouncementFilters,
  confirmCount: number
): Promise<AnnouncementDetail> {
  const { data, error } = await api.post<{ announcement: AnnouncementDetail }>("/v1/admin/announcements", {
    ...content,
    filters: cleanFilters(filters),
    confirmCount,
  });
  if (error || !data) fail(error, "Couldn't send the announcement.");
  return data.announcement;
}

export async function fetchHistory(signal?: AbortSignal): Promise<AnnouncementSummary[]> {
  const { data, error } = await api.get<{ announcements: AnnouncementSummary[] }>("/v1/admin/announcements?limit=50", { signal });
  if (error || !data) fail(error, "Couldn't load the history.");
  return data.announcements;
}

export async function fetchDetail(id: string, signal?: AbortSignal): Promise<AnnouncementDetail> {
  const { data, error } = await api.get<{ announcement: AnnouncementDetail }>(`/v1/admin/announcements/${encodeURIComponent(id)}`, { signal });
  if (error || !data) fail(error, "Couldn't load the announcement.");
  return data.announcement;
}

/** Approved city records only (the admin places list never returns others). */
export async function searchCityOptions(q: string, signal?: AbortSignal): Promise<CityOption[]> {
  const params = new URLSearchParams({ q: q.trim(), limit: "12" });
  const { data, error } = await api.get<{ places: Array<{ id: string; country: string; city_label: string }> }>(
    `/v1/admin/places?${params.toString()}`,
    { signal }
  );
  if (error || !data) fail(error, "Couldn't search cities.");
  return data.places.map((p) => ({ id: p.id, label: `${p.city_label}, ${p.country}` }));
}

/** Public: the unsubscribe page posts the token from the email link. */
export async function unsubscribeWithToken(token: string, undo = false): Promise<boolean> {
  const { data, error } = await api.post<{ unsubscribed: boolean }>(
    undo ? "/v1/announcements/resubscribe" : "/v1/announcements/unsubscribe",
    { token }
  );
  if (error || !data) fail(error, "Something went wrong. Try the link again.");
  return data.unsubscribed;
}
