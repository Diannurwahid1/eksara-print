import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { ApiOkResponse, ApiOperation } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators";
import { SESSION_COOKIE, SessionGuard, type SessionUser } from "../common/session.guard";
import { AuthService, OAUTH_STATE_COOKIE, type GoogleOauthCookie } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  @Get("google/start")
  @ApiOperation({ summary: "Redirect to Google OAuth (authorization code + PKCE)" })
  googleStart(@Query("returnTo") returnTo = "/app", @Res() res: Response): void {
    const target = this.auth.isAllowlistedPath(returnTo) ? returnTo : "/app";
    res.redirect(this.auth.startGoogleLogin(target, res));
  }

  @Get("google/callback")
  @ApiOperation({ summary: "Google redirect target; establishes the browser session" })
  async googleCallback(@Query() query: Record<string, string>, @Req() req: Request, @Res() res: Response): Promise<void> {
    const returnToRaw = (query.state ?? "").split("|")[1] ?? "/app";
    const returnTo = this.auth.isAllowlistedPath(returnToRaw) ? returnToRaw : "/app";

    let oauthCookie: GoogleOauthCookie | undefined;
    try {
      oauthCookie = JSON.parse(req.cookies?.[OAUTH_STATE_COOKIE] ?? "null");
    } catch {
      oauthCookie = undefined;
    }

    await this.auth.completeGoogleLogin(query, oauthCookie, res);
    res.redirect(returnTo);
  }

  @Post("logout")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Clear the server session" })
  async logout(@Req() req: Request, @Res() res: Response, @Body() _body: unknown): Promise<void> {
    await this.auth.logout(req.cookies?.[SESSION_COOKIE], res);
    res.status(200).json({ ok: true });
  }
}

@Controller()
export class MeController {
  constructor(private auth: AuthService) {}

  @Get("me")
  @UseGuards(SessionGuard)
  @ApiOkResponse({ description: "Current customer profile" })
  @ApiOperation({ summary: "Current customer profile" })
  me(@CurrentUser() user: SessionUser): SessionUser {
    return user;
  }
}
