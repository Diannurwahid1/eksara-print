import { Controller, Get, Module } from "@nestjs/common";
import { AuthController, AuthService, SessionGuard } from "./auth";
import { WalletController, WalletGuard, WalletService } from "./wallet";
import { BillingController, BillingService } from "./billing";
import { Database } from "./database";
import { ChainService } from "./chain";
import { StorageService } from "./storage";
import { FlowController, FlowService, StationGuard } from "./flow";
import { ExpiryService } from "./expiry";

@Controller("health")
class HealthController {
  @Get()
  health() {
    return { service: "eksara-api", status: "up", configured: Boolean(
      process.env.DATABASE_URL && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET &&
      process.env.SUMOPOD_API_KEY && process.env.SUMOPOD_WEBHOOK_SECRET &&
      process.env.MONAD_RPC_URL && process.env.MONAD_CHAIN_ID && process.env.MONAD_CONTRACT_ADDRESS && process.env.MONAD_RELAYER_PRIVATE_KEY &&
      process.env.LOCAL_STORAGE_URL_SECRET && process.env.LOCAL_STORAGE_URL_SECRET.length >= 32 &&
      process.env.EKSARA_STATION_DEVICE_TOKEN && (process.env.PIN_PEPPER?.length || 0) >= 32
    ) };
  }
}

@Module({
  controllers: [HealthController, AuthController, WalletController, BillingController, FlowController],
  providers: [Database, AuthService, SessionGuard, WalletGuard, WalletService, BillingService, ChainService, StorageService, FlowService, StationGuard, ExpiryService]
})
export class AppModule {}
