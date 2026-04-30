import { Inject, Injectable } from "@nestjs/common";
import type { BotStatusCurrentResponse } from "@binance-futures/shared";
import { LegacyDataService } from "../legacy-data/legacy-data.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

@Injectable()
export class BotStatusService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LegacyDataService) private readonly legacyData: LegacyDataService
  ) {}

  async getCurrent(symbol: string, mode: string): Promise<BotStatusCurrentResponse> {
    let snapshot: Record<string, unknown> | null = null;
    let metrics: Record<string, unknown> | null = null;
    let source = "arquivos-legados";

    if (this.prisma.isDatabaseReady) {
      try {
        const [snapshotRow, metricsRow] = await Promise.all([
          this.prisma.botSnapshot.findFirst({
            where: { symbol, mode },
            orderBy: { generatedAt: "desc" },
            select: { payload: true },
          }),
          this.prisma.botMetric.findFirst({
            where: { symbol, mode },
            orderBy: { generatedAt: "desc" },
            select: { payload: true },
          }),
        ]);

        snapshot = toRecord(snapshotRow?.payload);
        metrics = toRecord(metricsRow?.payload);

        if (snapshot || metrics) {
          source = "postgres-prisma";
        }
      } catch {
        snapshot = null;
        metrics = null;
      }
    }

    if (!snapshot) {
      snapshot = await this.legacyData.readSnapshot(symbol, mode);
    }

    if (!metrics) {
      metrics = await this.legacyData.readMetrics(symbol, mode);
    }

    if ((snapshot || metrics) && source === "postgres-prisma" && (!snapshot || !metrics)) {
      source = "prisma-hibrido";
    }

    return {
      source,
      symbol,
      mode,
      snapshot,
      metrics,
    };
  }
}
