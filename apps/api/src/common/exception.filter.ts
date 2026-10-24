import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { Response } from "express";

/** Maps every error to the `{ code, message }` JSON contract (handoff §3). */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let code = "INTERNAL";
    let message = "Unexpected server error";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        message = body;
      } else if (body && typeof body === "object" && "code" in body) {
        code = String((body as Record<string, unknown>).code);
        message = String((body as Record<string, unknown>).message ?? message);
      } else if (body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).message)) {
        // class-validator payload
        code = "VALIDATION_FAILED";
        const messages = (body as Record<string, unknown>).message as string[];
        message = messages.join("; ");
      } else if (body && typeof body === "object" && "message" in body) {
        message = String((body as Record<string, unknown>).message);
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.stack ?? exception.message);
    }

    res.status(status).json({ code, message });
  }
}
