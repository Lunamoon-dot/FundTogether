import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { hedVendorVerificationSchema } from "./hed-vendor-verification.schema";
import { HedVendorVerificationService } from "./hed-vendor-verification.service";

@Controller("v1/disbursement/vendors")
@UseGuards(AuthGuard)
export class HedVendorVerificationController {
  constructor(private readonly vendors: HedVendorVerificationService) {}

  @Get()
  list(@Req() request: Request) { return this.vendors.list(request.account!.userId); }

  @Post("verify")
  verify(@Body() body: unknown, @Req() request: Request) {
    const parsed = hedVendorVerificationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ message: "HED vendor verification is incomplete or invalid", issues: parsed.error.issues });
    return this.vendors.verify(request.account!.userId, parsed.data);
  }
}
