import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { and, eq, gt } from "drizzle-orm";
import { DbService } from "../db/db.module";
import { stations } from "../db/schema";
import { ApiError } from "../common/api-error";
import { hashToken } from "../common/crypto";

export type PairedStation = {
  id: string;
  shopId: string | null;
  name: string;
};

declare module "express-serve-static-core" {
  interface Request {
    station?: PairedStation;
  }
}

/**
 * Authenticates an Eksara Station via its per-device credential
 * (`Authorization: Bearer <credential>`). Handoff §5: device-specific
 * credential with rotation and revocation.
 */
@Injectable()
export class StationGuard implements CanActivate {
  constructor(private db: DbService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization ?? "";
    const credential = header.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!credential) throw new ApiError(401, "STATION_UNAUTHORIZED", "Missing station credential");

    const rows = await this.db.db
      .select()
      .from(stations)
      .where(and(eq(stations.credentialHash, hashToken(credential)), eq(stations.status, "active")))
      .limit(1);
    const station = rows[0];
    if (!station) throw new ApiError(401, "STATION_UNAUTHORIZED", "Station credential is invalid or revoked");

    await this.db.db.update(stations).set({ lastSeenAt: new Date() }).where(eq(stations.id, station.id));

    req.station = { id: station.id, shopId: station.shopId, name: station.name };
    return true;
  }
}
