import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: "ok",
      protocolKind: "CAMPAIGNS",
      chainId: Number(process.env.CHAIN_ID ?? 31339),
      contractAddress: process.env.FUNDTOGETHER_CONTRACT_ADDRESS ?? null,
    };
  }
}
