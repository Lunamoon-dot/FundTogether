import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { keccak256, toHex } from "viem";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { platformRoles } from "../database/schema";
import { hedVendorVerificationSchema } from "./hed-vendor-verification.schema";

@Injectable()
export class HedVendorVerificationService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>) {}

  private async admin(userId: string) {
    const [staff] = await this.db.select().from(platformRoles).where(eq(platformRoles.userId, userId));
    if (!staff?.roles.includes("ADMIN")) throw new ForbiddenException("Current ADMIN role required for HED vendor verification");
  }

  async list(userId: string) {
    await this.admin(userId);
    return this.db.select().from(schema.hedVendorVerifications).orderBy(desc(schema.hedVendorVerifications.createdAt));
  }

  async verify(userId: string, input: unknown) {
    await this.admin(userId);
    const parsed = hedVendorVerificationSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const validUntil = new Date(parsed.data.validUntil);
    if (validUntil.getTime() <= Date.now()) throw new BadRequestException("Vendor verification must remain valid");
    const reportBytes = JSON.stringify({ schemaVersion: "hed.vendor-verification.v1", checkedBy: userId,
      checkedAt: new Date().toISOString(), ...parsed.data });
    return this.db.insert(schema.hedVendorVerifications).values({ vendorWallet: parsed.data.vendorWallet, content: parsed.data,
      status: "VERIFIED", reportBytes, reportHash: keccak256(toHex(reportBytes)), checkedBy: userId, validUntil }).returning();
  }
}
