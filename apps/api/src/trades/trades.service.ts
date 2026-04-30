import { Inject, Injectable } from "@nestjs/common";
import type {
  DashboardOverviewTrade,
  DomainCollectionResponse,
} from "@binance-futures/shared";
import { LegacyDataService } from "../legacy-data/legacy-data.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

type ListTradesInput = {
  symbol: string;
  mode: string;
  limit: number;
};

@Injectable()
export class TradesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LegacyDataService) private readonly legacyData: LegacyDataService
  ) {}

  async listTrades(input: ListTradesInput): Promise<DomainCollectionResponse<DashboardOverviewTrade>> {
    const { symbol, mode, limit } = input;

    if (this.prisma.isDatabaseReady) {
      try {
        const rows = await this.prisma.trade.findMany({
          where: { symbol, mode },
          orderBy: [{ eventTimestamp: "desc" }, { id: "desc" }],
          take: limit,
          select: { payload: true },
        });

        const items = rows
          .map((row) => row.payload as unknown as DashboardOverviewTrade)
          .filter(Boolean);

        if (items.length > 0) {
          return {
            source: "postgres-prisma",
            symbol,
            mode,
            count: items.length,
            items,
          };
        }
      } catch {
        // fallback abaixo
      }
    }

    const items = await this.legacyData.readTrades(symbol, mode, limit);
    return {
      source: "arquivos-legados",
      symbol,
      mode,
      count: items.length,
      items,
    };
  }
}
