import { Controller, Get, Inject, Query } from "@nestjs/common";
import { DashboardService } from "./dashboard.service.js";

@Controller("dashboard")
export class DashboardController {
  constructor(
    @Inject(DashboardService)
    private readonly dashboardService: DashboardService
  ) {}

  @Get("overview")
  getOverview(
    @Query("symbol") symbol = "BTCUSDT",
    @Query("mode") mode = "live"
  ) {
    return this.dashboardService.getOverview(symbol, mode);
  }
}
