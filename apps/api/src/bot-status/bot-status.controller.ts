import { Controller, Get, Inject, Query } from "@nestjs/common";
import { BotStatusService } from "./bot-status.service.js";

@Controller("bot-status")
export class BotStatusController {
  constructor(@Inject(BotStatusService) private readonly botStatusService: BotStatusService) {}

  @Get("current")
  getCurrent(
    @Query("symbol") symbol = "BTCUSDT",
    @Query("mode") mode = "live"
  ) {
    return this.botStatusService.getCurrent(symbol, mode);
  }
}
