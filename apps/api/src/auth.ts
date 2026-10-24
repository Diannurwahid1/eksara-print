import { randomBytes, createHash, randomUUID } from "node:crypto";
import {
  BadRequestException, CanActivate, Controller, ExecutionContext, Get, Injectable,
  Post, Query, Req, Res, ServiceUnavailableException, UnauthorizedException, UseGuards
} from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Request, Response } from "express";
import { Database } from "./database";

export type EksaraUser = { id: string; email: string; name: string; picture: string | null; wallet_address: string | null };
export type AuthRequest = Request & { eksaraUser?: EksaraUser };
const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
const cookieName = () => process.env.SESSION_COOKIE_SECURE === "true" ? "__Host-eksara_session" : "eksara_session";
const appOrigin = () => process.env.APP_ORIGIN || "http://127.0.0.1:3000";

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly db: Database) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const cookies = Object.fromEntries((request.headers.cookie || "").split(";").map((part) => part.trim().split("=")));
    const token = cookies[cookieName()];
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new UnauthorizedException("Sign in with Google first");
    if (!["GET", "HEAD"].includes(request.method) && request.headers.origin !== appOrigin()) throw new UnauthorizedException("Invalid request origin");
    const result = await this.db.query<EksaraUser>(
      `SELECT u.id, u.email, u.name, u.picture, u.wallet_address
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`, [tokenHash(token)]
    );
    if (!result.rows[0]) throw new UnauthorizedException("Session expired");
    request.eksaraUser = result.rows[0];
    return true;
  }
}

@Injectable()
export class AuthService {
  private readonly googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
  constructor(private readonly db: Database) {}

  async start(returnTo?: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!clientId || !process.env.GOOGLE_CLIENT_SECRET || !redirectUri) throw new ServiceUnavailableException("Google OAuth is not configured");
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const destination = returnTo && /^\/app(?:\/[a-zA-Z0-9_-]+)*(?:\?[a-zA-Z0-9_=&%-]+)?$/.test(returnTo) ? returnTo : "/app";
    await this.db.query("INSERT INTO oauth_states (state_hash, code_verifier, return_to, expires_at) VALUES ($1,$2,$3,now() + interval '10 minutes')", [tokenHash(state), verifier, destination]);
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    for (const [key, value] of Object.entries({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile", state, code_challenge: challenge, code_challenge_method: "S256", access_type: "online", prompt: "select_account" })) url.searchParams.set(key, value);
    return url.toString();
  }

  async callback(code: string, state: string) {
    if (!code || !state) throw new BadRequestException("Missing OAuth response");
    const states = await this.db.query<{ code_verifier: string; return_to: string }>(
      "DELETE FROM oauth_states WHERE state_hash=$1 AND expires_at > now() RETURNING code_verifier, return_to", [tokenHash(state)]
    );
    const saved = states.rows[0];
    if (!saved) throw new UnauthorizedException("OAuth state expired");
    const payload = new URLSearchParams({
      code, client_id: process.env.GOOGLE_CLIENT_ID || "", client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || "", code_verifier: saved.code_verifier, grant_type: "authorization_code"
    });
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: payload, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new UnauthorizedException("Google token exchange failed");
    const tokens = await response.json() as { id_token?: string };
    if (!tokens.id_token) throw new UnauthorizedException("Missing Google ID token");
    const verified = await jwtVerify(tokens.id_token, this.googleKeys, { audience: process.env.GOOGLE_CLIENT_ID, issuer: ["https://accounts.google.com", "accounts.google.com"] });
    const claims = verified.payload;
    if (!claims.sub || typeof claims.email !== "string" || claims.email_verified !== true) throw new UnauthorizedException("Google email is not verified");
    const user = await this.db.query<{ id: string }>(
      `INSERT INTO users (id,google_sub,email,name,picture) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (google_sub) DO UPDATE SET email=excluded.email,name=excluded.name,picture=excluded.picture RETURNING id`,
      [randomUUID(), claims.sub, claims.email, typeof claims.name === "string" ? claims.name : claims.email, typeof claims.picture === "string" ? claims.picture : null]
    );
    const sessionToken = randomBytes(32).toString("hex");
    await this.db.query("INSERT INTO sessions (id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,now() + interval '7 days')", [randomUUID(), user.rows[0].id, tokenHash(sessionToken)]);
    return { sessionToken, returnTo: saved.return_to };
  }

  async logout(request: Request) {
    const cookies = Object.fromEntries((request.headers.cookie || "").split(";").map((part) => part.trim().split("=")));
    const token = cookies[cookieName()];
    if (token) await this.db.query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash(token)]);
  }
}

@Controller("v1")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get("auth/google/start")
  async start(@Query("returnTo") returnTo: string | undefined, @Res() response: Response) {
    response.redirect(await this.auth.start(returnTo));
  }

  @Get("auth/google/callback")
  async callback(@Query("code") code: string, @Query("state") state: string, @Res() response: Response) {
    const { sessionToken, returnTo } = await this.auth.callback(code, state);
    response.cookie(cookieName(), sessionToken, { httpOnly: true, secure: process.env.SESSION_COOKIE_SECURE === "true", sameSite: "lax", path: "/", maxAge: 7 * 24 * 3600 * 1000 });
    response.redirect(`${appOrigin()}${returnTo}`);
  }

  @Get("me")
  @UseGuards(SessionGuard)
  me(@Req() request: AuthRequest) {
    const user = request.eksaraUser!;
    return { name: user.name, email: user.email, picture: user.picture, walletAddress: user.wallet_address };
  }

  @Post("auth/logout")
  @UseGuards(SessionGuard)
  async logout(@Req() request: AuthRequest, @Res() response: Response) {
    await this.auth.logout(request);
    response.clearCookie(cookieName(), { path: "/" });
    response.json({ ok: true });
  }
}
