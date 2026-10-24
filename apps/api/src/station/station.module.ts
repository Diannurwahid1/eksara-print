import { Module } from "@nestjs/common";
import { BlockchainModule } from "../blockchain/blockchain.module";
import { DocumentsModule } from "../documents/documents.module";
import { ShareGrantsModule } from "../share-grants/share-grants.module";
import { StationController } from "./station.controller";
import { StationGuard } from "./station.guard";
import { StationService } from "./station.service";

@Module({
  imports: [ShareGrantsModule, DocumentsModule, BlockchainModule],
  controllers: [StationController],
  providers: [StationService, StationGuard],
  exports: [StationService],
})
export class StationModule {}
