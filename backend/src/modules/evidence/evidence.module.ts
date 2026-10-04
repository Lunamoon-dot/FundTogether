import { Module } from "@nestjs/common";
import { EvidenceAccessService } from "./evidence-access.service";
import { AuthModule } from "../auth/auth.module";
import { AuthGuard } from "../auth/auth.guard";
import { EvidenceDraftsController } from "./evidence-drafts.controller";
import { EvidenceDraftsService } from "./evidence-drafts.service";
import { EvidenceFilesController, EvidenceFileAccessGuard } from "./evidence-files.controller";
import { EvidenceFilesService } from "./evidence-files.service";
import { EvidenceStorageService } from "./evidence-storage.service";

@Module({
  imports: [AuthModule],
  controllers: [EvidenceDraftsController, EvidenceFilesController],
  providers: [AuthGuard, EvidenceAccessService, EvidenceDraftsService, EvidenceFileAccessGuard, EvidenceFilesService, EvidenceStorageService],
  exports: [EvidenceAccessService, EvidenceDraftsService],
})
export class EvidenceModule {}
