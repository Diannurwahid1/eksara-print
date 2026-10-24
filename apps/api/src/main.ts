import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import express from "express";
import { AppModule } from "./app.module";

const PORT = Number(process.env.PORT ?? 4000);
const WEB_ORIGINS = (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(",").filter(Boolean);

async function bootstrap(): Promise<void> {
  // bodyParser: false so we can parse JSON everywhere EXCEPT the raw document
  // upload route, which must receive the raw bytes (handoff §3 upload intent).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });

  app.setGlobalPrefix("v1");
  app.enableCors({ origin: WEB_ORIGINS, credentials: true });
  app.use(cookieParser());
  app.use(
    "/v1/documents",
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (req.method === "PUT" && req.path.endsWith("/blob")) {
        return express.raw({ type: () => true, limit: "55mb" })(req, res, next);
      }
      next();
    },
  );
  app.use(express.json({ limit: "1mb" }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Eksara API")
    .setDescription("Backend contract per docs/backend-handoff.md")
    .setVersion("0.1.0")
    .build();
  SwaggerModule.setup("openapi", app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(PORT);
  new Logger("Bootstrap").log(`Eksara API listening on http://localhost:${PORT} (openapi docs at /openapi)`);
}

void bootstrap();
