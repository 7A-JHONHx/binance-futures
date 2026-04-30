import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
} from "@nestjs/common";
import { SettingsService } from "./settings.service.js";

type UpsertSettingBody = {
  value?: unknown;
  description?: string | null;
};

@Controller("settings")
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly settingsService: SettingsService) {}

  @Get()
  getSettings() {
    return this.settingsService.listSettings();
  }

  @Get(":key")
  getSetting(@Param("key") key: string) {
    return this.settingsService.getSetting(key);
  }

  @Put(":key")
  upsertSetting(
    @Param("key") key: string,
    @Body() body: UpsertSettingBody
  ) {
    return this.settingsService.upsertSetting(key, body.value, body.description ?? null);
  }
}
