import { Module } from "@nestjs/common";
import { AnalysesModule } from "../analyses/analyses.module.js";
import { BotStatusModule } from "../bot-status/bot-status.module.js";
import { TradesModule } from "../trades/trades.module.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";

@Module({
  imports: [BotStatusModule, TradesModule, AnalysesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
