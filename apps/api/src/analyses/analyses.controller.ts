import { Controller, Get, Inject, Query } from "@nestjs/common";
import { AnalysesService } from "./analyses.service.js";

function normalizeLimit(limit: string | undefined, fallback = 30) {
  const parsed = Number.parseInt(limit ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, 150);
}

@Controller("analyses")
export class AnalysesController {
  constructor(@Inject(AnalysesService) private readonly analysesService: AnalysesService) {}

  @Get()
  getAnalyses(
    @Query("symbol") symbol = "BTCUSDT",
    @Query("mode") mode = "live",
    @Query("limit") limit?: string
  ) {
    return this.analysesService.listAnalyses({
      symbol,
      mode,
      limit: normalizeLimit(limit),
    });
  }
}
