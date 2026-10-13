import { Module } from "@nestjs/common";
import { RewardCampaignService } from "./reward-campaign.service";
import { RewardPledgeService } from "./reward-pledge.service";
import { RewardFulfillmentService } from "./reward-fulfillment.service";
import { RewardCryptoService } from "./reward-crypto.service";
import { RewardIndexerService } from "./reward-indexer.service";
import { RewardPublicController } from "./reward-public.controller";
import { RewardCreatorController } from "./reward-creator.controller";
import { RewardBackerController } from "./reward-backer.controller";
import { RewardResolverController } from "./reward-resolver.controller";
import { RewardAdminController } from "./reward-admin.controller";
import { RewardHealthController } from "./reward-health.controller";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../modules/auth/auth.module";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [
    RewardPublicController,
    RewardCreatorController,
    RewardBackerController,
    RewardResolverController,
    RewardAdminController,
    RewardHealthController,
  ],
  providers: [
    RewardCryptoService,
    RewardIndexerService,
    RewardCampaignService,
    RewardPledgeService,
    RewardFulfillmentService,
  ],
  exports: [
    RewardCryptoService,
    RewardIndexerService,
    RewardCampaignService,
    RewardPledgeService,
    RewardFulfillmentService,
  ],
})
export class RewardModule {}
