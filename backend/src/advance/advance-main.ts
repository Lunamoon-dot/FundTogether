import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import { resolve } from "node:path";
import { AdvanceAppModule } from "./advance-app.module";
import { backendRoot } from "./backend-root";
import { completeAdvanceOpenApi } from "./advance-openapi";

async function bootstrap() {
  const { guardEnvironment } = require(resolve(backendRoot, "scripts/workflow-b/guard-environment.cjs"));
  guardEnvironment(process.env);
  const app = await NestFactory.create(AdvanceAppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableCors({ origin: process.env.WEB_ORIGIN, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const document = completeAdvanceOpenApi(SwaggerModule.createDocument(app, new DocumentBuilder()
    .setTitle("FundTogether Workflow B API").setVersion("0.2.0").build()));
  SwaggerModule.setup("docs", app, document);
  await app.listen(3001, "127.0.0.1");
}
void bootstrap();
