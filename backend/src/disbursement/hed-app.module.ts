import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { configuration } from "../config/env.config";
import { HedModule } from "./hed.module";

@Module({ imports: [
  ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [configuration] }),
  LoggerModule.forRoot({ pinoHttp: { level: process.env.LOG_LEVEL ?? "info",
    redact: ["req.headers.cookie", "req.headers.authorization", "res.headers[\"set-cookie\"]", "req.body.password"] } }),
  HedModule,
] })
export class HedAppModule {}
