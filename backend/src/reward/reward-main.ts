import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import { RewardAppModule } from "./reward-app.module";

async function bootstrap() {
  const app = await NestFactory.create(RewardAppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableCors({ origin: process.env.WEB_ORIGIN, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, new DocumentBuilder().setTitle("FundTogether Reward API").setVersion("1.0.0").build()));
  await app.listen(Number(process.env.PORT ?? 3002), "127.0.0.1");
}
void bootstrap();
