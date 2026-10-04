import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { AuthGuard } from "../auth/auth.guard";
import {
  bindOrganizationWalletSchema,
  createOrganizationSchema,
} from "./organization.schema";
import { OrganizationsService } from "./organizations.service";

@Controller("organizations")
@UseGuards(AuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  create(@Body() body: unknown, @Req() request: Request) {
    const parsed = createOrganizationSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Organization name and description must be valid.",
        issues: parsed.error.issues,
      });
    }
    return this.organizationsService.create(
      request.account!.userId,
      parsed.data,
    );
  }

  @Get()
  list(@Req() request: Request) {
    return this.organizationsService.list(request.account!.userId);
  }

  @Put(":organizationId/wallet")
  bindWallet(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    const parsed = bindOrganizationWalletSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        "Wallet address and chain ID must be valid",
      );
    return this.organizationsService.bindWallet(
      organizationId,
      request.account!.userId,
      parsed.data,
    );
  }
}
