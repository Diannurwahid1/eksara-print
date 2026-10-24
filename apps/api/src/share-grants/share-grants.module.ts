import { Module } from "@nestjs/common";
import { ShareGrantsController } from "./share-grants.controller";
import { ShareGrantsService } from "./share-grants.service";

@Module({
  controllers: [ShareGrantsController],
  providers: [ShareGrantsService],
  exports: [ShareGrantsService],
})
export class ShareGrantsModule {}
