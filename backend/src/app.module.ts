import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { configuration } from './config/env.config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { IndexerModule } from './indexer/indexer.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    LoggerModule.forRoot({ pinoHttp: { level: process.env.LOG_LEVEL ?? 'info' } }),
    DatabaseModule,
    HealthModule,
    BlockchainModule,
    IndexerModule,
  ],
})
export class AppModule {}
