import { Module } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { CHAIN_DEPLOYMENT } from './blockchain.constants';
import deployment = require('./generated/deployment.local.json');

@Module({
  providers: [{ provide: CHAIN_DEPLOYMENT, useValue: deployment }, BlockchainService],
  exports: [BlockchainService, CHAIN_DEPLOYMENT],
})
export class BlockchainModule {}
