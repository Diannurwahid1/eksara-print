import { type ExecutionContext, createParamDecorator, UnauthorizedException } from "@nestjs/common";
import type { PairedStation } from "./station.guard";

/** Reads the paired station attached by StationGuard. */
export const CurrentStation = createParamDecorator((_data: unknown, ctx: ExecutionContext): PairedStation => {
  const req = ctx.switchToHttp().getRequest();
  if (!req.station) throw new UnauthorizedException();
  return req.station;
});
