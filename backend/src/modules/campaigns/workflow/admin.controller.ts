import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../../auth/auth.guard";
import { AdminGuard } from "../../auth/roles.guard";
import { CampaignWorkflowService } from "./campaign.service";

@Controller("v1/fundtogether/admin")
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly campaigns: CampaignWorkflowService) {}

  @Get("creators")
  listCreators() {
    return this.campaigns.listCreatorProfilesForAdmin();
  }
}

