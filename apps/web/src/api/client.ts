const rawApiBaseUrl = import.meta.env.VITE_API_URL?.trim() ?? "";
/**
 * Production uses same-origin `/v1/*` via hosting rewrites (see `vercel.json`) so
 * auth cookies remain first-party and survive browser third-party cookie restrictions.
 */
export const API_BASE_URL = import.meta.env.PROD ? "" : rawApiBaseUrl;
const API_BASE = API_BASE_URL;

export type ApiError = { code: string; message?: string };

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ data?: T; error?: ApiError; retryAfterSeconds?: number; aborted?: boolean }> {
  const url = `${API_BASE}${path}`;
  const { signal, headers: optHeaders, ...rest } = options;
  const headers: Record<string, string> = { ...(optHeaders as Record<string, string>) };
  // Fastify rejects `Content-Type: application/json` when there is no JSON body (e.g. GET).
  const jsonBody = typeof rest.body === "string" && rest.body.length > 0;
  if (jsonBody && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      credentials: "include",
      headers,
      signal,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { aborted: true };
    }
    return {
      error: {
        code: "NETWORK_ERROR",
        message:
          "Could not reach the API. Local: run apps/api on port 4000 with VITE_API_URL unset (Vite proxies /v1). Deployed: ensure /v1 reaches your API (Vercel rewrites or VITE_API_URL + CORS).",
      },
    };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const retryAfter = res.headers.get("retry-after");
    return {
      error: {
        code: body.code ?? "UNKNOWN",
        message: body.message ?? res.statusText,
      },
      retryAfterSeconds: retryAfter ? parseInt(retryAfter, 10) : undefined,
    };
  }
  return { data: body as T };
}

/** Options for `api.get`; pass `signal` from `AbortController` (e.g. `useEffect` cleanup) to cancel the fetch. */
export type ApiGetInit = Pick<RequestInit, "signal" | "headers">;

export const api = {
  get: <T>(path: string, init?: ApiGetInit) => request<T>(path, { method: "GET", ...init }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Multipart POST (e.g. PDF upload). Sends cookies; response body must be JSON. */
export async function apiPostForm<T>(path: string, form: FormData): Promise<{ data?: T; error?: ApiError }> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { method: "POST", body: form, credentials: "include" });
  const body: unknown = await res.json().catch(() => ({}));
  const b = body as Record<string, unknown>;
  if (!res.ok) {
    return {
      error: {
        code: typeof b.code === "string" ? b.code : "UNKNOWN",
        message: typeof b.message === "string" ? b.message : res.statusText
      }
    };
  }
  return { data: body as T };
}

/** GET /v1/me returns { person } — shape matches API SessionActor */
export type MePerson = {
  personId: string;
  institutionalEmail: string;
  role: "alumni" | "admin" | "super_admin";
  departmentCode: string | null;
  departmentName: string | null;
  joiningYear: number | null;
};

export function isSuperAdmin(person: Pick<MePerson, "role"> | undefined | null): boolean {
  return person?.role === "super_admin";
}

export type Me = { person: MePerson };

/** GET /v1/me/profile returns { profile } */
export type MyProfileView = {
  id: string;
  fullName: string | null;
  institutionalEmail?: string;
  departmentCode: string | null;
  departmentName: string | null;
  parsedDepartmentCode: string | null;
  parsedDepartmentName: string | null;
  batchYear: number | null;
  parsedJoiningYear: number | null;
  degreeCode?: string | null;
  degreeName?: string | null;
  bio: string | null;
  personalEmail?: string | null;
  mobilePhone?: string | null;
  residenceCountry?: string | null;
  residenceCity?: string | null;
  profileCompletedAt: string | null;
  /** Set when the full onboarding funnel (all steps) is finished. */
  onboardingCompletedAt: string | null;
  /** Successful OTP/magic-link logins; gates onboarding after cap (see onboardingEligibility). */
  appLoginCount: number;
  createdAt: string;
  updatedAt: string;
  /** Present on GET /v1/me/profile; used when gating onboarding if session `person` is stale. */
  role?: MePerson["role"];
};

export type MeProfileResponse = { profile: MyProfileView };

/** GET /v1/me/occupations returns { occupations } */
export type MyOccupationView = { id: string; occupationTypeCode: string; roleTitle: string; isCurrent: boolean };
export type MeOccupationsResponse = { occupations: MyOccupationView[] };

/** GET /v1/search returns { results, pageInfo } */
export type SearchProfileView = {
  id: string;
  fullName: string;
  departmentCode: string | null;
  departmentName: string | null;
  parsedDepartmentCode: string | null;
  parsedDepartmentName: string | null;
  batchYear: number | null;
  parsedJoiningYear: number | null;
  degreeCode: string | null;
  degreeName: string | null;
  bio: string | null;
  headlineRoleTitle: string | null;
  headlineOrganizationName: string | null;
  residenceCountry: string | null;
  residenceCity: string | null;
  matchReasons: string[];
};

export type SearchNormalizationMeta = {
  applied: boolean;
  batchFromQuery?: number;
  deptFromQuery?: string;
  companyFromQuery?: string;
  removedTokens?: string[];
};

export type SearchResult = {
  results: SearchProfileView[];
  pageInfo: { hasMore: boolean; nextCursor: string | null };
  wideningSummary?: string | null;
  messageKey?: string | null;
  searchSessionId?: string | null;
  normalization?: SearchNormalizationMeta | null;
};

/** GET /v1/directory/residence-cities — city/country pairs ordered by alumni count */
export type ResidenceCityAggregate = { city: string; country: string; count: number };
export type ResidenceCitiesResponse = { cities: ResidenceCityAggregate[] };

/** GET /v1/campus-monthly/current — latest digest metadata (PDF bytes via /v1/campus-monthly/current/pdf) */
export type CampusMonthlyIssueDto = { issueMonth: string; headingLabel: string };
export type CampusMonthlyCurrentResponse = { issue: CampusMonthlyIssueDto | null };
export type CampusMonthlyUploadResponse = { issue: CampusMonthlyIssueDto | null };

/** GET /v1/contact-requests/inbox — pending requests where viewer is recipient */
export type ContactRequestInboxItem = {
  id: string;
  senderPersonId: string;
  senderFullName: string | null;
  senderDepartmentCode: string | null;
  message: string;
  createdAt: string;
};

export type ContactRequestsInboxResponse = { requests: ContactRequestInboxItem[] };

/** POST /v1/connection-threads */
export type CreateConnectionThreadResponse = { threadId: string; reusedThread: boolean };

/** GET /v1/connection-threads */
export type ConnectionThreadListItem = {
  id: string;
  initiatorPersonId: string;
  recipientPersonId: string;
  status: string;
  kind: "general" | "referral";
  updatedAt: string;
  counterpartyPersonId: string;
  counterpartyFullName: string | null;
  lastMessageBody: string;
  lastMessageAuthorPersonId: string;
  lastMessageCreatedAt: string;
};

export type ConnectionThreadsListResponse = { threads: ConnectionThreadListItem[] };

export type AvailableDisclosureOption = {
  kind: "institutional_email" | "personal_email" | "profile_link";
  label: string;
  profileLinkId?: string;
};

/** GET /v1/connection-threads/:id */
export type ConnectionThreadDetailResponse = {
  thread: {
    id: string;
    initiatorPersonId: string;
    recipientPersonId: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  kind: "general" | "referral";
  counterpartyPersonId: string;
  counterpartyFullName: string | null;
  messages: { id: string; authorPersonId: string; body: string; createdAt: string }[];
  disclosures: {
    id: string;
    personId: string;
    kind: string;
    profileLinkId: string | null;
    disclosedValue: string;
    createdAt: string;
  }[];
  messageCount: number;
  showShareNudge: boolean;
  showOfflineContactPrompt: boolean;
  messagesDeletionWarning: string | null;
  referralReplyCount: number;
  availableDisclosures: AvailableDisclosureOption[];
};

/** GET /v1/notifications — aggregated in-app activity */
export type NotificationItem =
  | {
      kind: "contact_request_received";
      id: string;
      occurredAt: string;
      contactRequestId: string;
      senderPersonId: string;
      senderFullName: string | null;
      message: string;
    }
  | {
      kind: "contact_request_resolved";
      id: string;
      occurredAt: string;
      contactRequestId: string;
      outcome: "accepted" | "declined";
      recipientPersonId: string;
      recipientFullName: string | null;
    }
  | {
      kind: "bulletin_response";
      id: string;
      occurredAt: string;
      responseId: string;
      intentcastId: string;
      postPreview: string;
      responderPersonId: string;
      responderFullName: string;
      responseMessage: string;
    }
  | {
      kind: "connection_thread_reply";
      id: string;
      occurredAt: string;
      threadId: string;
      counterpartyPersonId: string;
      counterpartyFullName: string | null;
      lastMessagePreview: string;
    };

export type NotificationsResponse = { items: NotificationItem[] };

/** GET /v1/notifications/summary — badge count */
export type NotificationsSummaryResponse = { count: number };

/** GET /v1/intentcasts */
export type IntentcastFeedItem = {
  id: string;
  authorPersonId: string;
  authorFullName: string;
  authorDepartmentCode: string | null;
  authorDepartmentName: string | null;
  /** Graduation / cohort year for short bylines (e.g. ’24). */
  authorBatchYear?: number | null;
  /** Current occupation (from feed join); used for author hover tooltips. */
  authorCurrentRoleTitle?: string | null;
  authorCurrentOrganizationName?: string | null;
  category: "hiring" | "mentorship" | "collaboration" | "guidance";
  content: string;
  status: string;
  expiresAt: string;
  closedAt: string | null;
  createdAt: string;
  editableUntil: string;
  /** Set when the author removed the post from the public bulletin; others no longer see it. */
  authorSoftDeletedAt?: string | null;
  /** After this time the row and replies are permanently deleted server-side (default ~7 days after author removal). */
  authorDeletePurgeAt?: string | null;
  responseCount: number;
  /** True when the signed-in user has already replied (at most one reply per post). */
  viewerHasResponded: boolean;
};

/** GET /v1/intentcasts/:id/responses (author only) */
export type IntentcastResponseItem = {
  id: string;
  intentcastId: string;
  responderPersonId: string;
  responderFullName: string;
  responderDepartmentCode: string | null;
  responderDepartmentName: string | null;
  message: string;
  createdAt: string;
};

export type IntentcastFeedResponse = {
  intentcasts: IntentcastFeedItem[];
  pageInfo: { hasMore: boolean; nextOffset: number | null };
};

/** GET /v1/intentcasts/:id — one card if the viewer may see it */
export type IntentcastSingleResponse = { intentcast: IntentcastFeedItem };

/** GET /v1/profiles/:id returns { profile, occupations, links } */
export type PublicProfileView = {
  id: string;
  fullName: string;
  departmentCode: string | null;
  departmentName: string | null;
  batchYear: number | null;
  parsedJoiningYear: number | null;
  bio: string | null;
  /** Present when viewing your own profile only. */
  personalEmail?: string | null;
  /** Present when viewing your own profile only. */
  mobilePhone?: string | null;
  residenceCountry: string | null;
  residenceCity: string | null;
};

export type OccupationView = {
  id: string;
  occupationTypeCode: string;
  occupationTypeName: string;
  organizationId: string | null;
  organizationName: string | null;
  roleTitle: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
};

export type ProfileLinkView = {
  id: string;
  platform: string;
  url: string;
  label: string | null;
};

export type MeLinksResponse = { links: ProfileLinkView[] };

export type ProfileResponse = {
  profile: PublicProfileView;
  occupations: OccupationView[];
  links: ProfileLinkView[];
};
