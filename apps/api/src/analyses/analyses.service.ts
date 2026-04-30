import { Inject, Injectable } from "@nestjs/common";
import type {
  DashboardOverviewAnalysis,
  DomainCollectionResponse,
} from "@binance-futures/shared";
import { LegacyDataService } from "../legacy-data/legacy-data.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

type ListAnalysesInput = {
  symbol: string;
  mode: string;
  limit: number;
};

@Injectable()
export class AnalysesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LegacyDataService) private readonly legacyData: LegacyDataService
  ) {}

  async listAnalyses(
    input: ListAnalysesInput
  ): Promise<DomainCollectionResponse<DashboardOverviewAnalysis>> {
    const { symbol, mode, limit } = input;

    if (this.prisma.isDatabaseReady) {
      try {
        const rows = await this.prisma.analysis.findMany({
          where: { symbol, mode },
          orderBy: [{ eventTimestamp: "desc" }, { id: "desc" }],
          take: limit,
          select: { payload: true },
        });

        const items = rows
          .map((row) => row.payload as unknown as DashboardOverviewAnalysis)
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

    const items = await this.legacyData.readAnalyses(symbol, mode, limit);
    return {
      source: "arquivos-legados",
      symbol,
      mode,
      count: items.length,
      items,
    };
  }
}
