import { type ExecutionContext, createParamDecorator, UnauthorizedException } from "@nestjs/common";
import type { SessionUser } from "./session.guard";

/** Reads the customer attached by SessionGuard. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): SessionUser => {
  const req = ctx.switchToHttp().getRequest();
  if (!req.user) throw new UnauthorizedException();
  return req.user;
});
