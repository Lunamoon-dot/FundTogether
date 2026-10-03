import { Module } from "@nestjs/common";
import { EvidenceAccessService } from "./evidence-access.service";
import { AuthModule } from "../auth/auth.module";
import { AuthGuard } from "../auth/auth.guard";
import { EvidenceDraftsController } from "./evidence-drafts.controller";
import { EvidenceDraftsService } from "./evidence-drafts.service";

@Module({
  imports: [AuthModule],
  controllers: [EvidenceDraftsController],
  providers: [AuthGuard, EvidenceAccessService, EvidenceDraftsService],
  exports: [EvidenceAccessService, EvidenceDraftsService],
})
export class EvidenceModule {}
