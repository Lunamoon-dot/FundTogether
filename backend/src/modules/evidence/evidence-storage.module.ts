import { Module } from "@nestjs/common";
import { EvidenceStorageService } from "./evidence-storage.service";

@Module({
  providers: [EvidenceStorageService],
  exports: [EvidenceStorageService],
})
export class EvidenceStorageModule {}
