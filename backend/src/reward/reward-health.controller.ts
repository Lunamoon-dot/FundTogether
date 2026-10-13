import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class RewardHealthController {
  @Get()
  getHealth() {
    return {
      status: "ok",
      protocolKind: "REWARD",
      chainId: Number(process.env.CHAIN_ID ?? 31339),
      contractAddress: process.env.REWARD_CONTRACT_ADDRESS ?? null,
    };
  }
}
