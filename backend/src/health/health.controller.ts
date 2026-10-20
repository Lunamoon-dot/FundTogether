import { Controller, Get, Inject } from "@nestjs/common";
import { VNEXT_CONNECTION, type VNextConnection } from "../indexer/vnext-indexer.service";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(VNEXT_CONNECTION) private readonly vnextConnection: VNextConnection | null = null,
  ) {}

  @Get()
  getHealth() {
    if (process.env.FUNDTOGETHER_PROTOCOL === "FUNDTOGETHER_VNEXT") {
      return {
        status: "ok",
        protocolKind: this.vnextConnection?.manifest.protocolKind ?? "FUNDTOGETHER_VNEXT",
        chainId: this.vnextConnection?.manifest.chainId ?? Number(process.env.CHAIN_ID ?? 31339),
        contractAddress: this.vnextConnection?.manifest.campaignEscrow ?? null,
      };
    }

    return {
      status: "ok",
      protocolKind: "CAMPAIGNS",
      chainId: Number(process.env.CHAIN_ID ?? 31339),
      contractAddress: process.env.FUNDTOGETHER_CONTRACT_ADDRESS ?? null,
    };
  }
}
