import { HttpException, type HttpExceptionOptions } from "@nestjs/common";

/**
 * Application error carrying a stable machine `code` so the frontend can branch
 * on it. Serialized to `{ "code": "PIN_INVALID", "message": "..." }` by the
 * global exception filter (handoff §3 error contract).
 */
export class ApiError extends HttpException {
  readonly code: string;

  constructor(status: number, code: string, message: string, options?: HttpExceptionOptions) {
    super({ code, message }, status, options);
    this.code = code;
  }

  static unauthenticated(message = "Authentication required") {
    return new ApiError(401, "UNAUTHENTICATED", message);
  }
  static forbidden(code = "FORBIDDEN", message = "You do not have access to this resource") {
    return new ApiError(403, code, message);
  }
  static notFound(code = "NOT_FOUND", message = "Resource not found") {
    return new ApiError(404, code, message);
  }
  static badRequest(code = "BAD_REQUEST", message = "Invalid request") {
    return new ApiError(400, code, message);
  }
}
