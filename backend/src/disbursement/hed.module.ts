import { Module } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseModule } from "../database/database.module";
import { backendRoot } from "../advance/backend-root";
import { HedBlockchainService } from "./hed-blockchain.service";
import { HedIndexerService } from "./hed-indexer.service";
import { HED_DEPLOYMENT } from "./hed.types";
import type { HedDeployment } from "./hed.types";
import { HedHealthController, HedPublicController } from "./hed-public.controller";

@Module({
  imports: [DatabaseModule],
  controllers: [HedHealthController, HedPublicController],
  providers: [{
    provide: HED_DEPLOYMENT,
    useFactory: (): HedDeployment => {
      const { validateManifest } = require(resolve(backendRoot, "scripts/hed/generate-artifacts.cjs"));
      const manifest = JSON.parse(readFileSync(resolve(backendRoot, "../.local/hed/generated/deployment.local.json"), "utf8"));
      validateManifest(manifest);
      if (manifest.rpcUrl !== process.env.HED_BLOCKCHAIN_RPC_URL) throw new Error("HED manifest/RPC configuration mismatch");
      return Object.freeze(manifest);
    },
  }, HedBlockchainService, HedIndexerService],
  exports: [HedBlockchainService, HedIndexerService, HED_DEPLOYMENT],
})
export class HedModule {}
