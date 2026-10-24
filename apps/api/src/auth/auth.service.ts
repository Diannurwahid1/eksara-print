import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Response } from "express";
import { DbService } from "../db/db.module";
import { oauthAccounts, sessions, users } from "../db/schema";
import { ApiError } from "../common/api-error";
import { hashToken, randomToken } from "../common/crypto";
import { SESSION_COOKIE, type SessionUser } from "../common/session.guard";

const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 168);
export const OAUTH_STATE_COOKIE = "eksara_oauth";
const OAUTH_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

export type GoogleOauthCookie = { state: string; codeVerifier: string };

@Injectable()
export class AuthService {
  constructor(private db: DbService) {}

  private get googleConfigured(): boolean {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }

  get redirectUri(): string {
    return process.env.GOOGLE_REDIRECT_URI ?? "";
  }

  /** Builds the Google authorization-code + PKCE URL and parks state/verifier in a short-lived cookie. */
  startGoogleLogin(returnTo: string, res: Response): string {
    if (!this.googleConfigured) {
      throw new ApiError(503, "GOOGLE_NOT_CONFIGURED", "Google login is not configured on this API deployment");
    }
    const state = randomToken(16);
    const codeVerifier = randomToken(32);
    const { codeChallenge } = this.pkce(codeVerifier);

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
    url.searchParams.set("redirect_uri", this.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", `${state}|${returnTo}`);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    res.cookie(OAUTH_STATE_COOKIE, JSON.stringify({ state, codeVerifier }), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: OAUTH_COOKIE_MAX_AGE_MS,
    });
    return url.toString();
  }

  /**
   * Exchanges the authorization code, upserts the customer, and establishes a
   * server session cookie.
   */
  /**
   * Exchanges the authorization code, upserts the customer, and establishes a
   * server session cookie. `oauthCookie` is the parsed state cookie set by
   * startGoogleLogin; `state` must match it exactly.
   */
  async completeGoogleLogin(
    query: Record<string, string>,
    oauthCookie: GoogleOauthCookie | undefined,
    res: Response,
  ): Promise<string> {
    if (!this.googleConfigured) {
      throw new ApiError(503, "GOOGLE_NOT_CONFIGURED", "Google login is not configured on this API deployment");
    }
    const raw = query.state ?? "";
    const [state, returnTo = "/app"] = raw.split("|");
    if (!this.isAllowlistedPath(returnTo) || !query.code) {
      throw new ApiError(400, "OAUTH_STATE_INVALID", "Invalid OAuth state or missing code");
    }
    if (!oauthCookie?.state || !oauthCookie?.codeVerifier || oauthCookie.state !== state) {
      throw new ApiError(400, "OAUTH_STATE_INVALID", "OAuth state mismatch or expired");
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code: query.code,
        code_verifier: oauthCookie.codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: this.redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      throw new ApiError(401, "OAUTH_EXCHANGE_FAILED", "Google authorization code exchange failed");
    }
    const tokens = (await tokenRes.json()) as { id_token?: string };
    if (!tokens.id_token) {
      throw new ApiError(401, "OAUTH_MISSING_ID_TOKEN", "Google did not return an identity token");
    }

    const identity = this.decodeIdToken(tokens.id_token);
    const user = await this.upsertGoogleUser(identity);
    await this.issueSessionCookie(user, res);
    res.clearCookie(OAUTH_STATE_COOKIE);
    return returnTo;
  }

  async logout(token: string | undefined, res: Response): Promise<void> {
    if (token) {
      await this.db.db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.tokenHash, hashToken(token)));
    }
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax" });
    res.clearCookie(OAUTH_STATE_COOKIE, { httpOnly: true, sameSite: "lax" });
  }

  async currentUser(userId: string): Promise<SessionUser> {
    const rows = await this.db.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = rows[0];
    if (!user) throw ApiError.unauthenticated();
    return { id: user.id, email: user.email, name: user.name, picture: user.picture };
  }

  async issueSessionCookie(user: SessionUser, res: Response): Promise<void> {
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);
    await this.db.db.insert(sessions).values({ userId: user.id, tokenHash: hashToken(token), expiresAt });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      expires: expiresAt,
    });
  }

  /** Loads the latest non-revoked session for a user (used in tests/debugging). */
  async latestSession(userId: string) {
    return this.db.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
      .orderBy(desc(sessions.createdAt))
      .limit(1);
  }

  /** returnTo must be a relative path from an explicit allowlist (handoff §3). */
  isAllowlistedPath(path: string): boolean {
    return /^\/(app|p)(\/|$)/.test(path) && !path.startsWith("//");
  }

  // --- Google helpers ---

  /** S256 code challenge = base64url(sha256(verifier)). */
  private pkce(verifier: string): { codeChallenge: string } {
    const codeChallenge = createHash("sha256").update(verifier).digest("base64url");
    return { codeChallenge };
  }

  /**
   * Decodes the ID token payload.
   * TODO(production): verify the signature against Google's JWKS (e.g. via
   * `jose` or `openid-client`) instead of trusting the payload — handoff §5.
   */
  private decodeIdToken(idToken: string): { sub: string; email: string; name?: string; picture?: string } {
    const payload = idToken.split(".")[1];
    if (!payload) throw new ApiError(401, "OAUTH_BAD_ID_TOKEN", "Malformed Google identity token");
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!json.sub || !json.email) {
      throw new ApiError(401, "OAUTH_BAD_ID_TOKEN", "Google identity token is missing subject/email");
    }
    return json;
  }

  private async upsertGoogleUser(identity: { sub: string; email: string; name?: string; picture?: string }) {
    const existing = await this.db.db
      .select()
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.provider, "google"), eq(oauthAccounts.providerUserId, identity.sub)))
      .limit(1);

    if (existing[0]) {
      const rows = await this.db.db
        .update(users)
        .set({ name: identity.name, picture: identity.picture })
        .where(eq(users.id, existing[0].userId))
        .returning();
      return rows[0];
    }

    const inserted = await this.db.db
      .insert(users)
      .values({
        email: identity.email,
        name: identity.name ?? null,
        picture: identity.picture ?? null,
      })
      .returning();
    const user = inserted[0];
    await this.db.db
      .insert(oauthAccounts)
      .values({ userId: user.id, provider: "google", providerUserId: identity.sub });
    return user;
  }
}
