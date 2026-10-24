import { randomBytes, randomUUID } from "node:crypto";
import {
  BadRequestException, Body, CanActivate, ConflictException, Controller, ExecutionContext,
  Injectable, Post, Req, ServiceUnavailableException, UnauthorizedException, UseGuards
} from "@nestjs/common";
import { getAddress, isAddress, verifyMessage } from "viem";
import { z } from "zod";
import { AuthRequest, SessionGuard } from "./auth";
import { Database } from "./database";

const addressSchema = z.object({ address: z.string().refine(isAddress, "Invalid wallet address") });
const verifySchema = z.object({ challengeId: z.uuid(), signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/) });

@Injectable()
export class WalletGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (!request.eksaraUser?.wallet_address) throw new UnauthorizedException("Connect and verify a wallet before uploading");
    return true;
  }
}

@Injectable()
export class WalletService {
  constructor(private readonly db: Database) {}
  async challenge(userId: string, address: string) {
    if (!process.env.MONAD_CHAIN_ID) throw new ServiceUnavailableException("Monad network is not configured");
    const walletAddress = getAddress(address);
    const nonce = randomBytes(16).toString("hex");
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 5 * 60 * 1000);
    const domain = new URL(process.env.APP_ORIGIN || "http://127.0.0.1:3000").host;
    const message = `${domain} wants you to sign in with your Ethereum account:\n${walletAddress}\n\nLink this wallet to your Eksara Google account before uploading a document.\n\nURI: ${process.env.APP_ORIGIN || "http://127.0.0.1:3000"}\nVersion: 1\nChain ID: ${process.env.MONAD_CHAIN_ID}\nNonce: ${nonce}\nIssued At: ${issuedAt.toISOString()}\nExpiration Time: ${expiresAt.toISOString()}\nResources:\n- urn:eksara:user:${userId}`;
    const challengeId = randomUUID();
    await this.db.query("INSERT INTO wallet_challenges (id,user_id,address,message,expires_at) VALUES ($1,$2,$3,$4,$5)", [challengeId, userId, walletAddress.toLowerCase(), message, expiresAt]);
    return { challengeId, message, expiresAt: expiresAt.toISOString() };
  }

  async verify(userId: string, challengeId: string, signature: `0x${string}`) {
    const result = await this.db.query<{ address: string; message: string }>("DELETE FROM wallet_challenges WHERE id=$1 AND user_id=$2 AND expires_at > now() RETURNING address,message", [challengeId, userId]);
    const saved = result.rows[0];
    if (!saved) throw new UnauthorizedException("Wallet challenge expired or already used");
    const valid = await verifyMessage({ address: saved.address as `0x${string}`, message: saved.message, signature });
    if (!valid) throw new UnauthorizedException("Wallet signature is invalid");
    try {
      await this.db.query("UPDATE users SET wallet_address=$1,wallet_verified_at=now() WHERE id=$2", [saved.address, userId]);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new ConflictException("Wallet is already linked to another Eksara account");
      throw error;
    }
    return { walletAddress: getAddress(saved.address) };
  }
}

@Controller("v1/wallet")
@UseGuards(SessionGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Post("challenge")
  async challenge(@Req() request: AuthRequest, @Body() body: unknown) {
    const parsed = addressSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Enter a valid wallet address");
    return this.wallet.challenge(request.eksaraUser!.id, parsed.data.address);
  }

  @Post("verify")
  async verify(@Req() request: AuthRequest, @Body() body: unknown) {
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid wallet verification request");
    return this.wallet.verify(request.eksaraUser!.id, parsed.data.challengeId, parsed.data.signature as `0x${string}`);
  }
}
