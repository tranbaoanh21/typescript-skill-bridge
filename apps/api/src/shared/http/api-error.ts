export interface ApiErrorOptions {
  cause?: unknown;
  code: string;
  details?: unknown;
  message: string;
  status: number;
}

export class ApiError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status: number;

  constructor({ cause, code, details, message, status }: ApiErrorOptions) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export const unauthorized = (code = 'AUTH_UNAUTHORIZED', message = 'Authentication is required.') =>
  new ApiError({ code, message, status: 401 });

export const forbidden = (code = 'AUTH_FORBIDDEN', message = 'You do not have permission.') =>
  new ApiError({ code, message, status: 403 });

export const notFound = (code: string, message: string) =>
  new ApiError({ code, message, status: 404 });

export const conflict = (code: string, message: string) =>
  new ApiError({ code, message, status: 409 });
