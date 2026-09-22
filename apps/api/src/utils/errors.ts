export class AppError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }

  static badRequest(message: string, code = "BAD_REQUEST") {
    return new AppError(400, message, code);
  }

  static unauthorized(message: string, code = "UNAUTHORIZED") {
    return new AppError(401, message, code);
  }

  static forbidden(message: string, code = "FORBIDDEN") {
    return new AppError(403, message, code);
  }

  static notFound(message: string, code = "NOT_FOUND") {
    return new AppError(404, message, code);
  }

  static conflict(message: string, code = "CONFLICT") {
    return new AppError(409, message, code);
  }

  static tooManyRequests(message: string, code = "RATE_LIMITED") {
    return new AppError(429, message, code);
  }

  static notImplemented(message: string, code = "NOT_IMPLEMENTED") {
    return new AppError(501, message, code);
  }
}
