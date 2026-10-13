import { Module } from "@nestjs/common";
import { RewardCampaignService } from "./reward-campaign.service";
import { RewardPledgeService } from "./reward-pledge.service";
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
import { EvidenceStorageModule } from "../modules/evidence/evidence-storage.module";
import { RewardEditionsService } from "./reward-editions.service";
import { RewardEditionsController, RewardEditionsPreviewController } from "./reward-editions.controller";
import { EDITIONS_CONNECTION, loadEditionsConnection, RewardEditionsIndexerService } from "./reward-editions-indexer.service";
import { RewardEditionsPublicationService } from "./reward-editions-publication.service";
import { RewardEditionsChainController } from "./reward-editions-chain.controller";
import { RewardEditionsDeliveryService } from "./reward-editions-delivery.service";
import { RewardEditionsDeliveryController, RewardEditionsPublicEvidenceController } from "./reward-editions-delivery.controller";

@Module({
  imports: [DatabaseModule, AuthModule, EvidenceStorageModule],
  controllers: [
    RewardEditionsDeliveryController,
    RewardEditionsPublicEvidenceController,
    RewardEditionsChainController,
    RewardEditionsController,
    RewardEditionsPreviewController,
    RewardPublicController,
    RewardCreatorController,
    RewardBackerController,
    RewardResolverController,
    RewardAdminController,
    RewardHealthController,
  ],
  providers: [
    RewardEditionsDeliveryService,
    RewardEditionsPublicationService,
    { provide: EDITIONS_CONNECTION, useFactory: loadEditionsConnection },
    RewardEditionsIndexerService,
    RewardEditionsService,
    RewardCryptoService,
    RewardIndexerService,
    RewardCampaignService,
    RewardPledgeService,
  ],
  exports: [
    RewardCryptoService,
    RewardIndexerService,
    RewardCampaignService,
    RewardPledgeService,
  ],
})
export class RewardModule {}
