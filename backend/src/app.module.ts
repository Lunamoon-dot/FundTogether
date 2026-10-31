import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { ThrottlerModule } from "@nestjs/throttler";
import { configuration } from "./config/env.config";
import { DatabaseModule } from "./database/database.module";
import { AuthModule } from "./modules/auth/auth.module";
import { EvidenceStorageModule } from "./modules/evidence/evidence-storage.module";
import { CampaignWorkflowService } from "./modules/campaigns/workflow/campaign.service";
import { CommitmentService } from "./modules/campaigns/workflow/commitment.service";
import { AdminController } from "./modules/campaigns/workflow/admin.controller";
import { CreatorController } from "./modules/campaigns/workflow/creator.controller";
import { PublicController } from "./modules/campaigns/workflow/public.controller";
import { ResolverController } from "./modules/campaigns/workflow/resolver.controller";
import { CampaignController, CampaignPreviewController } from "./modules/campaigns/controllers/campaign.controller";
import { ChainController } from "./modules/campaigns/controllers/chain.controller";
import { CampaignService } from "./modules/campaigns/services/campaign.service";
import { PublicationService } from "./modules/campaigns/services/publication.service";
import { DeliveryController, PublicEvidenceController } from "./modules/delivery/controllers/delivery.controller";
import { DeliveryService } from "./modules/delivery/services/delivery.service";
import { HealthController } from "./health/health.controller";
import { CampaignIndexerService, CAMPAIGN_CONNECTION, loadCampaignConnection } from "./indexer/campaign-indexer.service";
import { HistoricalCampaignIndexerService } from "./indexer/historical-campaign-indexer.service";
import { BackerController } from "./modules/pledges/workflow/backer.controller";
import { PledgeService } from "./modules/pledges/workflow/pledge.service";
import { ReviewConversationController } from "./modules/review/controllers/review-conversation.controller";
import { ReviewConversationService } from "./modules/review/services/review-conversation.service";
import { CompletionController } from "./modules/completion/controllers/completion.controller";
import { CompletionService } from "./modules/completion/services/completion.service";
import { PayoutController } from "./modules/payout/controllers/payout.controller";
import { PayoutService } from "./modules/payout/services/payout.service";
import { loadVNextConnection, VNEXT_CONNECTION, VNextIndexerService } from "./indexer/vnext-indexer.service";
import { VNextController } from "./modules/campaigns/controllers/vnext.controller";
import { VNextEvidenceController } from "./modules/campaigns/controllers/vnext-evidence.controller";
import { VNextEvidenceService } from "./modules/campaigns/services/vnext-evidence.service";

// The historical Campaign/Resolver runtime and VNext projection surface remain
// registered side by side during migration. Registration does not grant either
// backend path authority over VNext financial or Judge outcomes.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [configuration] }),
    LoggerModule.forRoot({ pinoHttp: { level: process.env.LOG_LEVEL ?? "info", redact: ["req.url", "req.headers.referer", "req.headers.cookie", "req.headers.authorization", "res.headers[\"set-cookie\"]", "req.body.password"] } }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    DatabaseModule,
    AuthModule,
    EvidenceStorageModule,
  ],
  controllers: [
    DeliveryController,
    PublicEvidenceController,
    ChainController,
    CampaignController,
    CampaignPreviewController,
    ReviewConversationController,
    PublicController,
    CreatorController,
    BackerController,
    ResolverController,
    AdminController,
    CompletionController,
    PayoutController,
    VNextController,
    VNextEvidenceController,
    HealthController,
  ],
  providers: [
    DeliveryService,
    ReviewConversationService,
    PublicationService,
    { provide: CAMPAIGN_CONNECTION, useFactory: loadCampaignConnection },
    { provide: VNEXT_CONNECTION, useFactory: loadVNextConnection },
    CampaignIndexerService,
    VNextIndexerService,
    CampaignService,
    CommitmentService,
    HistoricalCampaignIndexerService,
    CampaignWorkflowService,
    PledgeService,
    CompletionService,
    PayoutService,
    VNextEvidenceService,
  ],
  exports: [
    CommitmentService,
    HistoricalCampaignIndexerService,
    CampaignWorkflowService,
    PledgeService,
  ],
})
export class AppModule {}
