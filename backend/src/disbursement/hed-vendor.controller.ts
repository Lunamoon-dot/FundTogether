import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { HedVendorService } from "./hed-vendor.service";

@Controller("v1/disbursement/vendor")
@UseGuards(AuthGuard)
export class HedVendorController {
  constructor(private readonly vendors: HedVendorService) {}
  @Get("requests") list(@Req() request: Request) { return this.vendors.requests(request.account!.userId); }
}
