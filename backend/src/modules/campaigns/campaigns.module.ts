import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuthGuard } from "../auth/auth.guard";
import { EvidenceModule } from "../evidence/evidence.module";
import { CampaignsController } from "./campaigns.controller";
import { CampaignsService } from "./campaigns.service";
import { OrganizationCampaignsController } from "./organization-campaigns.controller";

@Module({
  imports: [AuthModule, EvidenceModule],
  controllers: [CampaignsController, OrganizationCampaignsController],
  providers: [AuthGuard, CampaignsService],
})
export class CampaignsModule {}
