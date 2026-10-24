import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";
import { ApiError } from "../common/api-error";
import { CurrentUser } from "../common/decorators";
import { SessionGuard, type SessionUser } from "../common/session.guard";
import { ShareGrantsService } from "./share-grants.service";

export class HandoffDto {
  @IsString() @Length(6, 6)
  pin!: string;
}

@ApiTags("share-grants")
@Controller("share-grants")
export class ShareGrantsController {
  constructor(private grants: ShareGrantsService) {}

  @Get(":token/public")
  @ApiOperation({ summary: "Safe metadata only — never file bytes, PIN, or customer contact" })
  async publicInfo(@Param("token") token: string) {
    return this.grants.publicInfo(token);
  }

  @Post(":token/handoff")
  @ApiOperation({ summary: "Validate PIN and issue a short-lived single-use handoff ticket" })
  async handoff(@Param("token") token: string, @Body() dto: HandoffDto) {
    return this.grants.handoff(token, dto.pin);
  }

  @Post(":token/revoke")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Revoke an owned, unused grant" })
  async revoke(@CurrentUser() user: SessionUser, @Param("token") token: string) {
    if (!token) throw ApiError.badRequest("TOKEN_REQUIRED", "Share token is required");
    return this.grants.revoke(user.id, token);
  }
}
