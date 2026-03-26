const API_BASE = import.meta.env.VITE_API_URL ?? "";

export type ApiError = { code: string; message?: string };

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ data?: T; error?: ApiError; retryAfterSeconds?: number }> {
  const url = `${API_BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch {
    return {
      error: {
        code: "NETWORK_ERROR",
        message:
          "Could not reach the API. Start the backend (apps/api on port 4000) and use the Vite dev server with VITE_API_URL unset, or set VITE_API_URL to your deployed API.",
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

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** GET /v1/me returns { person } — shape matches API SessionActor */
export type MePerson = {
  personId: string;
  institutionalEmail: string;
  role: "alumni" | "admin";
  departmentCode: string | null;
  departmentName: string | null;
  joiningYear: number | null;
};

export type Me = { person: MePerson };

/** GET /v1/me/profile returns { profile } */
export type MyProfileView = {
  id: string;
  fullName: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  parsedDepartmentCode: string | null;
  parsedDepartmentName: string | null;
  batchYear: number | null;
  parsedJoiningYear: number | null;
  bio: string | null;
  isSearchable: boolean;
  profileCompletedAt: string | null;
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
  batchYear: number | null;
  parsedJoiningYear: number | null;
  bio: string | null;
  headlineRoleTitle: string | null;
  headlineOrganizationName: string | null;
};

export type SearchResult = {
  results: SearchProfileView[];
  pageInfo: { hasMore: boolean; nextCursor: string | null };
};

/** GET /v1/profiles/:id returns { profile, occupations, links } */
export type PublicProfileView = {
  id: string;
  fullName: string;
  departmentCode: string | null;
  departmentName: string | null;
  batchYear: number | null;
  parsedJoiningYear: number | null;
  bio: string | null;
  skillsText: string | null;
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

export type ProfileResponse = {
  profile: PublicProfileView;
  occupations: OccupationView[];
  links: ProfileLinkView[];
};
