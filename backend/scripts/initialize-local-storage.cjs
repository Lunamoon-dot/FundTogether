require('dotenv').config({ quiet: true });
const { ConfigService } = require('@nestjs/config');
const { configuration } = require('../dist/src/config/env.config');
const { EvidenceStorageService } = require('../dist/src/modules/evidence/evidence-storage.service');

const storage = new EvidenceStorageService(new ConfigService(configuration()));
storage.initialize().then(() => {
  console.log('Private evidence bucket initialized. No anonymous bucket policy exists.');
}).catch(() => {
  console.error('Private evidence bucket initialization failed. Check MinIO and local storage configuration.');
  process.exitCode = 1;
}).finally(() => storage.onModuleDestroy());
