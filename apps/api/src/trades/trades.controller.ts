import { Controller, Get, Inject, Query } from "@nestjs/common";
import { TradesService } from "./trades.service.js";

function normalizeLimit(limit: string | undefined, fallback = 20) {
  const parsed = Number.parseInt(limit ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, 100);
}

@Controller("trades")
export class TradesController {
  constructor(@Inject(TradesService) private readonly tradesService: TradesService) {}

  @Get()
  getTrades(
    @Query("symbol") symbol = "BTCUSDT",
    @Query("mode") mode = "live",
    @Query("limit") limit?: string
  ) {
    return this.tradesService.listTrades({
      symbol,
      mode,
      limit: normalizeLimit(limit),
    });
  }
}
