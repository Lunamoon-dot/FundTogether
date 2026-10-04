import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { configuration } from "./config/env.config";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { BlockchainModule } from "./blockchain/blockchain.module";
import { IndexerModule } from "./indexer/indexer.module";
import { EvidenceModule } from "./modules/evidence/evidence.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CampaignsModule } from "./modules/campaigns/campaigns.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        redact: ["req.headers.cookie", "req.headers.authorization", "res.headers[\"set-cookie\"]", "req.body.password"],
      },
    }),
    DatabaseModule,
    HealthModule,
    BlockchainModule,
    IndexerModule,
    EvidenceModule,
    AuthModule,
    CampaignsModule,
    OrganizationsModule,
  ],
})
export class AppModule {}
