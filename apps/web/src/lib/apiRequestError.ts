/** A failed API request, keeping the server's error code (e.g. a browsing limit) for the page to show. */
export class ApiRequestError extends Error {
  readonly code: string;
  readonly status?: number;
  constructor(code: string, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
