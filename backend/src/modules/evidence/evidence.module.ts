import { Module } from "@nestjs/common";
import { EvidenceAccessService } from "./evidence-access.service";
import { AuthModule } from "../auth/auth.module";
import { AuthGuard } from "../auth/auth.guard";
import { EvidenceDraftsController } from "./evidence-drafts.controller";
import { EvidenceDraftsService } from "./evidence-drafts.service";
import { EvidenceFilesController, EvidenceFileAccessGuard } from "./evidence-files.controller";
import { EvidenceFilesService } from "./evidence-files.service";
import { EvidenceStorageService } from "./evidence-storage.service";
import { EvidencePackagesService } from './evidence-packages.service';
import { BlockchainModule } from '../../blockchain/blockchain.module';
import { IndexerModule } from '../../indexer/indexer.module';
import { MilestoneWorkflowService } from './milestone-workflow.service';
import { MilestoneWorkflowController } from './milestone-workflow.controller';

@Module({
  imports: [AuthModule, BlockchainModule, IndexerModule],
  controllers: [EvidenceDraftsController, EvidenceFilesController, MilestoneWorkflowController],
  providers: [AuthGuard, EvidenceAccessService, EvidenceDraftsService, EvidencePackagesService, EvidenceFileAccessGuard, EvidenceFilesService, EvidenceStorageService, MilestoneWorkflowService],
  exports: [EvidenceAccessService, EvidenceDraftsService, EvidenceStorageService],
})
export class EvidenceModule {}
