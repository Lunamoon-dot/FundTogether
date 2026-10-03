import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuthGuard } from "../auth/auth.guard";
import { EvidenceModule } from "../evidence/evidence.module";
import { CampaignsController } from "./campaigns.controller";
import { CampaignsService } from "./campaigns.service";

@Module({
  imports: [AuthModule, EvidenceModule],
  controllers: [CampaignsController],
  providers: [AuthGuard, CampaignsService],
})
export class CampaignsModule {}
