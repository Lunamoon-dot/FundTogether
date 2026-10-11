import { Module } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../modules/auth/auth.module";
import { backendRoot } from "../advance/backend-root";
import { HedBlockchainService } from "./hed-blockchain.service";
import { HedIndexerService } from "./hed-indexer.service";
import { HED_DEPLOYMENT } from "./hed.types";
import type { HedDeployment } from "./hed.types";
import { HedHealthController, HedPublicController } from "./hed-public.controller";
import { HedCampaignDraftController } from "./hed-campaign-draft.controller";
import { HedCampaignDraftService } from "./hed-campaign-draft.service";
import { HedRequestDraftController } from "./hed-request-draft.controller";
import { HedRequestDraftService } from "./hed-request-draft.service";
import { HedVendorVerificationController } from "./hed-vendor-verification.controller";
import { HedVendorVerificationService } from "./hed-vendor-verification.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [HedHealthController, HedPublicController, HedCampaignDraftController, HedRequestDraftController, HedVendorVerificationController],
  providers: [{
    provide: HED_DEPLOYMENT,
    useFactory: (): HedDeployment => {
      const { validateManifest } = require(resolve(backendRoot, "scripts/hed/generate-artifacts.cjs"));
      const manifest = JSON.parse(readFileSync(resolve(backendRoot, "../.local/hed/generated/deployment.local.json"), "utf8"));
      validateManifest(manifest);
      if (manifest.rpcUrl !== process.env.HED_BLOCKCHAIN_RPC_URL) throw new Error("HED manifest/RPC configuration mismatch");
      return Object.freeze(manifest);
    },
  }, HedBlockchainService, HedIndexerService, HedCampaignDraftService, HedRequestDraftService, HedVendorVerificationService],
  exports: [HedBlockchainService, HedIndexerService, HED_DEPLOYMENT],
})
export class HedModule {}
