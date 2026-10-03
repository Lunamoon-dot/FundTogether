import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { BrowserOriginGuard } from "./browser-origin.guard";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    { provide: APP_GUARD, useClass: BrowserOriginGuard },
  ],
  exports: [AuthGuard, AuthService],
})
export class AuthModule {}
