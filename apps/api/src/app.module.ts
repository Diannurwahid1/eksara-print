import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { AllExceptionsFilter } from "./common/exception.filter";
import { DbModule } from "./db/db.module";
import { AuthModule } from "./auth/auth.module";
import { DocumentsModule } from "./documents/documents.module";
import { OrdersModule } from "./orders/orders.module";
import { ShareGrantsModule } from "./share-grants/share-grants.module";
import { StationModule } from "./station/station.module";
import { EventsModule } from "./events/events.gateway";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    AuthModule,
    DocumentsModule,
    OrdersModule,
    ShareGrantsModule,
    StationModule,
    EventsModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
