import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);
  private databaseReady = false;

  async onModuleInit() {
    if (!process.env.DATABASE_URL) {
      return;
    }

    try {
      await this.$connect();
      this.databaseReady = true;
    } catch (error) {
      this.databaseReady = false;
      this.logger.warn(
        `Banco indisponivel para a nova API: ${error instanceof Error ? error.message : "erro desconhecido"}`
      );
    }
  }

  get isDatabaseReady() {
    return this.databaseReady;
  }
}
