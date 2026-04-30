import { Inject, Injectable } from "@nestjs/common";
import type { DashboardOverviewPayload } from "@binance-futures/shared";
import { AnalysesService } from "../analyses/analyses.service.js";
import { BotStatusService } from "../bot-status/bot-status.service.js";
import { TradesService } from "../trades/trades.service.js";

@Injectable()
export class DashboardService {
  constructor(
    @Inject(BotStatusService) private readonly botStatusService: BotStatusService,
    @Inject(TradesService) private readonly tradesService: TradesService,
    @Inject(AnalysesService) private readonly analysesService: AnalysesService
  ) {}

  async getOverview(symbol: string, mode: string): Promise<DashboardOverviewPayload> {
    const [status, trades, analyses] = await Promise.all([
      this.botStatusService.getCurrent(symbol, mode),
      this.tradesService.listTrades({ symbol, mode, limit: 10 }),
      this.analysesService.listAnalyses({ symbol, mode, limit: 10 }),
    ]);

    const sources = new Set([status.source, trades.source, analyses.source]);
    const source =
      sources.size === 1 ? [...sources][0] ?? "desconhecida" : "hibrido";

    return {
      generatedAt: new Date().toISOString(),
      source,
      refreshIntervalMs: 5000,
      snapshot: status.snapshot,
      metrics: status.metrics,
      trades: trades.items,
      analyses: analyses.items,
    };
  }
}
