import { Module } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AuthModule } from "../modules/auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { EvidenceStorageService } from "../modules/evidence/evidence-storage.service";
import { EvidenceAccessService } from "../modules/evidence/evidence-access.service";
import { AdvanceBlockchainService } from "./advance-blockchain.service";
import { ADVANCE_DEPLOYMENT } from "./advance.types";
import type { AdvanceDeployment } from "./advance.types";
import { backendRoot } from "./backend-root";
import { AdvanceCampaignService } from "./advance-campaign.service";
import { AdvanceCampaignController } from "./advance-campaign.controller";
import { OrganizationVerificationService } from "./organization-verification.service";
import { OrganizationVerificationController } from "./organization-verification.controller";
import { AdvanceReviewService } from "./advance-review.service";
import { AdvanceReviewController } from "./advance-review.controller";
import { AdvanceEvidenceService } from "./advance-evidence.service";
import { AdvanceIndexerService } from "./advance-indexer.service";
import { AdvanceWorkflowService } from "./advance-workflow.service";
import { AdvancePublicController, AdvanceWorkflowController } from "./advance-public.controller";
import { AdvanceHealthController } from "./advance-health.controller";
import { AdvanceEvidenceController, AdvanceEvidencePackageController, AdvancePublicEvidenceController,
  AdvanceEvidenceUploadGuard, AdvancePublicationUploadGuard } from "./advance-evidence.controller";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [AdvanceCampaignController, OrganizationVerificationController, AdvanceReviewController,
    AdvanceEvidenceController, AdvanceEvidencePackageController, AdvancePublicEvidenceController,
    AdvancePublicController, AdvanceWorkflowController, AdvanceHealthController],
  providers: [
    {
      provide: ADVANCE_DEPLOYMENT,
      useFactory: (): AdvanceDeployment => {
        const { guardEnvironment } = require(resolve(backendRoot, "scripts/workflow-b/guard-environment.cjs"));
        const { validateManifest } = require(resolve(backendRoot, "scripts/workflow-b/generate-artifacts.cjs"));
        guardEnvironment(process.env);
        const manifest = JSON.parse(readFileSync(resolve(backendRoot, "../.local/workflow-b/generated/deployment.local.json"), "utf8"));
        validateManifest(manifest);
        if (manifest.rpcUrl !== process.env.BLOCKCHAIN_RPC_URL) throw new Error("Workflow B manifest/RPC configuration mismatch");
        return Object.freeze(manifest);
      },
    },
    AdvanceBlockchainService, EvidenceStorageService, EvidenceAccessService, AdvanceCampaignService, OrganizationVerificationService, AdvanceReviewService,
    AdvanceEvidenceService, AdvanceEvidenceUploadGuard, AdvancePublicationUploadGuard,
    AdvanceIndexerService, AdvanceWorkflowService,
  ],
  exports: [AdvanceBlockchainService, EvidenceStorageService, EvidenceAccessService, ADVANCE_DEPLOYMENT],
})
export class AdvanceModule {}
