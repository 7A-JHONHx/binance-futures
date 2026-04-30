import { Global, Module } from "@nestjs/common";
import { LegacyDataService } from "./legacy-data.service.js";

@Global()
@Module({
  providers: [LegacyDataService],
  exports: [LegacyDataService],
})
export class LegacyDataModule {}
