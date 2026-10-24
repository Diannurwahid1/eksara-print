import { Injectable, Logger } from "@nestjs/common";
import { DbService } from "../db/db.module";
import { chainTransactions } from "../db/schema";
import { randomBytes } from "node:crypto";

export type ReleaseAuthorization = {
  chainId: number;
  txHash: string | null;
  status: "pending" | "confirmed" | "failed";
};

/**
 * SCAFFOLD-STUB for the Monad relayer.
 *
 * The real implementation must, per docs/backend-handoff.md §2 step 8 and §4:
 *  - call `consumeAuthorization(...)` on the Eksara smart contract via viem,
 *  - keep the relayer key server-side only (never sent to any client),
 *  - submit/observe the transaction and only issue the download lease after
 *    the confirmation policy passes,
 *  - record tx hash/block status in `chain_transactions` and reconcile after
 *    restarts.
 *
 * This stub returns a placeholder hash so the end-to-end flow can be exercised
 * on testnet-less development machines. It is intentionally marked NOT real.
 */
@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private readonly chainId = Number(process.env.MONAD_CHAIN_ID ?? 10143);

  constructor(private db: DbService) {}

  async authorizeRelease(releaseId: string, grantId: string): Promise<ReleaseAuthorization> {
    this.logger.warn(`STUB: would call consumeAuthorization() on chain ${this.chainId} for grant ${grantId}`);

    const txHash = `0xstub-${randomBytes(16).toString("hex")}`;
    const rows = await this.db.db
      .insert(chainTransactions)
      .values({ releaseId, chainId: this.chainId, txHash, status: "pending" })
      .returning();

    return { chainId: this.chainId, txHash: rows[0].txHash, status: rows[0].status as ReleaseAuthorization["status"] };
  }
}
