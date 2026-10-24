import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const origins = (process.env.APP_ORIGIN || "http://127.0.0.1:3000").split(",").map((value) => value.trim());
  app.enableCors({ origin: origins, credentials: true });
  await app.listen(Number(process.env.PORT || 4000), process.env.HOST || "127.0.0.1");
}
bootstrap();
