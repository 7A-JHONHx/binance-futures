import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AnalysesModule } from "./analyses/analyses.module.js";
import { BotStatusModule } from "./bot-status/bot-status.module.js";
import { DashboardModule } from "./dashboard/dashboard.module.js";
import { HealthController } from "./health/health.controller.js";
import { HealthService } from "./health/health.service.js";
import { LegacyDataModule } from "./legacy-data/legacy-data.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { SettingsModule } from "./settings/settings.module.js";
import { TradesModule } from "./trades/trades.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    LegacyDataModule,
    BotStatusModule,
    TradesModule,
    AnalysesModule,
    SettingsModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
