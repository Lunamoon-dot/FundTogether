import { Module } from '@nestjs/common';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { IndexerService } from './indexer.service';

@Module({ imports: [BlockchainModule], providers: [IndexerService], exports: [IndexerService] })
export class IndexerModule {}
