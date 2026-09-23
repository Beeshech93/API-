export type ErrorCode =
  | "INVALID_API_KEY"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | "INVALID_AMOUNT"
  | "INVALID_PHONE"
  | "INSUFFICIENT_BALANCE"
  | "PROVIDER_ERROR"
  | "PROVIDER_TIMEOUT"
  | "TRANSACTION_FAILED"
  | "TRANSACTION_NOT_FOUND"
  | "RATE_LIMIT_EXCEEDED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  INVALID_API_KEY: 401,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INVALID_REQUEST: 400,
  INVALID_AMOUNT: 400,
  INVALID_PHONE: 400,
  INSUFFICIENT_BALANCE: 402,
  PROVIDER_ERROR: 502,
  PROVIDER_TIMEOUT: 504,
  TRANSACTION_FAILED: 422,
  TRANSACTION_NOT_FOUND: 404,
  RATE_LIMIT_EXCEEDED: 429,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  status: number;
  code: ErrorCode;
  retryAfter?: number;

  constructor(code: ErrorCode, message: string, options: { status?: number; retryAfter?: number } = {}) {
    super(message);
    this.code = code;
    this.status = options.status ?? STATUS_BY_CODE[code];
    this.retryAfter = options.retryAfter;
  }
}
