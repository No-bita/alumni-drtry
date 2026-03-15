export class AppError extends Error {
  statusCode: number;
  code: string;
  expose: boolean;
  /** When set on 429 responses, clients should wait this many seconds before retrying. */
  retryAfterSeconds?: number;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    expose = true,
    retryAfterSeconds?: number
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.expose = expose;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

