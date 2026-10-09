const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
Object.assign(process.env, require('dotenv').parse(fs.readFileSync(path.join(root, 'backend/environments/workflow-b/.env.example'))),
  { INDEXER_ENABLED: 'false', LOG_LEVEL: 'silent' });
require('./guard-environment.cjs').guardEnvironment(process.env);
async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
  const { AdvanceAppModule } = require(path.join(root, 'backend/dist/src/advance/advance-app.module'));
  const { completeAdvanceOpenApi } = require(path.join(root, 'backend/dist/src/advance/advance-openapi'));
  const app = await NestFactory.create(AdvanceAppModule, { logger: false, abortOnError: false });
  try {
    const doc = completeAdvanceOpenApi(SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('FundTogether Workflow B API').setVersion('0.2.0').build()));
    const out = path.join(root, 'backend/src/advance/generated/openapi.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
    console.log('B OpenAPI exported from controller routes and runtime Zod schemas:', Object.keys(doc.paths).length, 'paths');
  } finally { await app.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
