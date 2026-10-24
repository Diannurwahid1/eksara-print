import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { DbService } from "../db/db.module";
import { sessions, users } from "../db/schema";
import { ApiError } from "./api-error";
import { hashToken } from "./crypto";

export const SESSION_COOKIE = "eksara_session";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
};

declare module "express-serve-static-core" {
  interface Request {
    user?: SessionUser;
  }
}

/** Validates the session cookie against the `sessions` table and loads the customer. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private db: DbService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) throw ApiError.unauthenticated();

    const rows = await this.db.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        picture: users.picture,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, hashToken(token)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    const user = rows[0];
    if (!user) throw ApiError.unauthenticated("Session expired, please sign in again");
    req.user = user;
    return true;
  }
}
