import { Module } from "@nestjs/common";
import { BotStatusController } from "./bot-status.controller.js";
import { BotStatusService } from "./bot-status.service.js";

@Module({
  controllers: [BotStatusController],
  providers: [BotStatusService],
  exports: [BotStatusService],
})
export class BotStatusModule {}
