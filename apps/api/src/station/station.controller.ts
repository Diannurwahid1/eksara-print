import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { ApiError } from "../common/api-error";
import { StationGuard, type PairedStation } from "./station.guard";
import { CurrentStation } from "./current-station.decorator";
import { StationService } from "./station.service";

export class PairStartDto {
  @IsString() @MinLength(1) @MaxLength(100)
  name!: string;
  @IsOptional() @IsString()
  publicKey?: string;
  @IsOptional() @IsString()
  shopId?: string;
}

export class PairApproveDto {
  @IsString() @MinLength(4)
  pairingCode!: string;
}

export class ClaimDto {
  @IsString() @MinLength(20)
  ticket!: string;
}

export class StatusDto {
  @IsIn(["processing", "printed", "failed"])
  status!: "processing" | "printed" | "failed";
  @IsOptional() @IsString()
  spoolerId?: string;
  @IsOptional() @IsString()
  idempotencyKey?: string;
}

@ApiTags("station")
@Controller("station")
export class StationController {
  constructor(private station: StationService) {}

  @Post("devices/pair/start")
  @ApiOperation({ summary: "Register a Print Station and get a pairing code + one-time credential" })
  async pairStart(@Body() dto: PairStartDto) {
    return this.station.startPairing(dto);
  }

  @Post("devices/pair/approve")
  @ApiOperation({ summary: "Approve a pending station for one shop (TODO: shop-owner auth)" })
  async pairApprove(@Body() dto: PairApproveDto) {
    return this.station.approvePairing(dto.pairingCode);
  }

  @Post("handoffs/claim")
  @UseGuards(StationGuard)
  @ApiOperation({ summary: "Exchange a single-use handoff ticket for a job ID" })
  async claimHandoff(@CurrentStation() station: PairedStation, @Body() dto: ClaimDto) {
    return this.station.claimHandoff(dto.ticket, { id: station.id, shopId: station.shopId });
  }

  @Get("jobs/:id")
  @UseGuards(StationGuard)
  @ApiOperation({ summary: "Job detail and approved print options; no permanent file URL" })
  async getJob(@Param("id", ParseUUIDPipe) id: string) {
    return this.station.getJob(id);
  }

  @Post("jobs/:id/authorize-release")
  @UseGuards(StationGuard)
  @ApiOperation({ summary: "Reserve the one-time release; runs Monad authorization (stubbed)" })
  async authorizeRelease(@CurrentStation() station: PairedStation, @Param("id", ParseUUIDPipe) id: string) {
    return this.station.authorizeRelease(id, station.id);
  }

  @Get("jobs/:id/download")
  @UseGuards(StationGuard)
  @ApiOperation({ summary: "Stream the file with a single-use lease" })
  async download(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("lease") lease: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.station.download(id, lease);
    if (!lease) throw ApiError.forbidden("LEASE_REQUIRED", "A download lease is required");
    res.status(200).setHeader("Content-Type", file.mimeType).setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`).end(file.bytes);
  }

  @Post("jobs/:id/status")
  @UseGuards(StationGuard)
  @ApiOperation({ summary: "Report processing/printed/failed with spooler ID" })
  async reportStatus(@Param("id", ParseUUIDPipe) id: string, @Body() dto: StatusDto) {
    return this.station.reportStatus(id, dto);
  }

  @Get("jobs/:id/receipt")
  @UseGuards(StationGuard)
  @ApiOperation({ summary: "Authorization ID, chain ID, tx hash, spooler outcome" })
  async receipt(@Param("id", ParseUUIDPipe) id: string) {
    return this.station.receipt(id);
  }
}
