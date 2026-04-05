import { api } from "../api/client";

/** For TanStack `queryFn`: throws on abort/error so the query error boundary works. */
export async function assertApiGet<T>(path: string, signal: AbortSignal): Promise<T> {
  const res = await api.get<T>(path, { signal });
  if (res.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  if (res.error) {
    throw new Error(res.error.message ?? res.error.code ?? "Request failed");
  }
  if (res.data === undefined) {
    throw new Error("No data");
  }
  return res.data;
}
