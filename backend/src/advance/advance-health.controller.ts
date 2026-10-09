import { Controller, Get, Header } from "@nestjs/common";
import { AdvanceBlockchainService } from "./advance-blockchain.service";
import { AdvanceIndexerService } from "./advance-indexer.service";
import { EvidenceStorageService } from "../modules/evidence/evidence-storage.service";

@Controller("health")
export class AdvanceHealthController {
  constructor(private readonly chain: AdvanceBlockchainService, private readonly indexer: AdvanceIndexerService,
    private readonly storage: EvidenceStorageService) {}
  @Get()
  @Header("Cache-Control", "no-store")
  async health() {
    const [rpc, storage, indexer] = await Promise.allSettled([this.chain.verifyDeployment(), this.storage.verifyPrivateBucket(), this.indexer.status()]);
    return { context: this.chain.context, status: rpc.status === "fulfilled" && storage.status === "fulfilled"
      && indexer.status === "fulfilled" && indexer.value.status === "ready" ? "ready" : "degraded",
      rpc: rpc.status === "fulfilled" ? "ready" : "unavailable_or_identity_mismatch",
      storage: storage.status === "fulfilled" ? "private_ready" : "unavailable_or_policy_invalid",
      indexer: indexer.status === "fulfilled" ? indexer.value : { status: "error", error: "B synchronization unavailable" } };
  }
}
