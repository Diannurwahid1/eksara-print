import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Database } from "./database";
import { StorageService } from "./storage";

@Injectable()
export class ExpiryService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  constructor(private readonly db: Database, private readonly storage: StorageService) {}

  onModuleInit() {
    if (!process.env.DATABASE_URL) return;
    this.timer = setInterval(() => { void this.tick(); }, 60_000);
    this.timer.unref();
    setTimeout(() => { void this.tick(); }, 10_000).unref();
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.db.query("UPDATE print_orders SET status='expired' WHERE status IN ('draft','shared','opened') AND expires_at<now()");
      await this.db.query("UPDATE print_orders SET status='failed' WHERE status='processing' AND created_at<now()-interval '48 hours'");
      const stale = await this.db.query<{ id: string; object_key: string }>(`
        SELECT d.id,d.object_key FROM documents d LEFT JOIN print_orders o ON o.document_id=d.id
        WHERE d.status IN ('pending','ready') AND (
          (d.status='pending' AND d.created_at<now()-interval '1 hour') OR
          (d.status='ready' AND o.id IS NULL AND d.created_at<now()-interval '24 hours') OR
          (d.status='ready' AND o.status IN ('expired','revoked','failed'))
        ) ORDER BY d.created_at LIMIT 20`);
      for (const doc of stale.rows) {
        try {
          await this.storage.delete(doc.object_key);
          await this.db.query("UPDATE documents SET status='deleted',deleted_at=now() WHERE id=$1 AND status<>'deleted'", [doc.id]);
        } catch { process.stderr.write("Eksara expiry cleanup failed for one document; will retry.\n"); }
      }
      await this.db.query("DELETE FROM handoff_tickets WHERE expires_at<now()");
      await this.db.query("DELETE FROM wallet_challenges WHERE expires_at<now()");
      await this.db.query("DELETE FROM oauth_states WHERE expires_at<now()");
      await this.db.query("DELETE FROM pin_attempts WHERE attempted_at<now()-interval '1 day'");
      await this.db.query("DELETE FROM sessions WHERE expires_at<now()");
    } catch { process.stderr.write("Eksara expiry cleanup failed; will retry.\n"); }
    finally { this.running = false; }
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}
