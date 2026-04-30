import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true })
  );

  app.enableCors();
  app.setGlobalPrefix("api");

  const port = Number(process.env.API_PORT || 3333);
  await app.listen(port, "0.0.0.0");

  Logger.log(`API NestJS ativa em http://localhost:${port}/api/health`, "Bootstrap");
}

bootstrap();
