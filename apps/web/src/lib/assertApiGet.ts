import { api } from "../api/client";
import { ApiRequestError } from "./apiRequestError";

export { ApiRequestError };

/** For TanStack `queryFn`: throws on abort/error so the query error boundary works. */
export async function assertApiGet<T>(path: string, signal: AbortSignal): Promise<T> {
  const res = await api.get<T>(path, { signal });
  if (res.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  if (res.error) {
    throw new ApiRequestError(res.error.code ?? "UNKNOWN", res.error.message ?? res.error.code ?? "Request failed", res.status);
  }
  if (res.data === undefined) {
    throw new Error("No data");
  }
  return res.data;
}
