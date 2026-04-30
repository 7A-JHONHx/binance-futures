import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  BotSettingCollectionResponse,
  BotSettingEntry,
  BotSettingMutationResponse,
} from "@binance-futures/shared";
import { PrismaService } from "../prisma/prisma.service.js";

function mapSetting(row: {
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: Date;
}): BotSettingEntry {
  return {
    key: row.key,
    value: row.value,
    description: row.description,
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class SettingsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listSettings(): Promise<BotSettingCollectionResponse> {
    if (!this.prisma.isDatabaseReady) {
      return {
        source: "sem-banco",
        count: 0,
        items: [],
      };
    }

    try {
      const rows = await this.prisma.botSetting.findMany({
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      });

      return {
        source: "postgres-prisma",
        count: rows.length,
        items: rows.map(mapSetting),
      };
    } catch {
      return {
        source: "sem-banco",
        count: 0,
        items: [],
      };
    }
  }

  async getSetting(key: string) {
    if (!this.prisma.isDatabaseReady) {
      throw new ServiceUnavailableException("Banco de dados nao configurado para settings");
    }

    const row = await this.prisma.botSetting.findUnique({
      where: { key },
    });

    if (!row) {
      throw new NotFoundException(`Setting ${key} nao encontrado`);
    }

    return {
      source: "postgres-prisma",
      item: mapSetting(row),
    };
  }

  async upsertSetting(
    key: string,
    value: unknown,
    description: string | null
  ): Promise<BotSettingMutationResponse> {
    if (!this.prisma.isDatabaseReady) {
      throw new ServiceUnavailableException("Banco de dados nao configurado para settings");
    }

    const row = await this.prisma.botSetting.upsert({
      where: { key },
      update: {
        value: value as never,
        description,
        updatedAt: new Date(),
      },
      create: {
        key,
        value: value as never,
        description,
      },
    });

    return {
      source: "postgres-prisma",
      item: mapSetting(row),
    };
  }
}
