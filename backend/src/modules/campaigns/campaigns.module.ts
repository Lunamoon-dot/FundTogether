import { CampaignSubmissionService } from './campaign-submission.service';
import { BlockchainModule } from '../../blockchain/blockchain.module';
import { IndexerModule } from '../../indexer/indexer.module';
import { CampaignProjectionService } from './campaign-projection.service';
import { CampaignReviewService } from './campaign-review.service';
import { PublicCampaignsController, CampaignReviewController, CampaignPublicationController, ContributionsController, RefundsController } from './campaign-projection.controller';
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuthGuard } from "../auth/auth.guard";
import { EvidenceModule } from "../evidence/evidence.module";
import { CampaignsController } from "./campaigns.controller";
import { CampaignsService } from "./campaigns.service";
import { OrganizationCampaignsController } from "./organization-campaigns.controller";

@Module({
  imports: [AuthModule, EvidenceModule, BlockchainModule, IndexerModule],
  controllers: [CampaignsController, OrganizationCampaignsController, PublicCampaignsController, CampaignReviewController, CampaignPublicationController, ContributionsController, RefundsController],
  providers: [AuthGuard, CampaignsService, CampaignSubmissionService, CampaignProjectionService, CampaignReviewService],
})
export class CampaignsModule {}
