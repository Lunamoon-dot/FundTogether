import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { organizationMembers, organizations, organizationVerificationRecords, platformRoles } from "../database/schema";
import { AdvanceBlockchainService } from "./advance-blockchain.service";
import { organizationVerificationSchema } from "./advance-review.schema";
import { sha256 } from "./advance-plan";

@Injectable()
export class OrganizationVerificationService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>,
    private readonly chain: AdvanceBlockchainService) {}

  async queue(userId: string) {
    const [staff] = await this.db.select().from(platformRoles).where(eq(platformRoles.userId, userId));
    if (!staff?.roles.includes("ADMIN")) throw new ForbiddenException("Current ADMIN role required for organization verification queue");
    return this.db.select({ id: organizations.id, name: organizations.name, description: organizations.description,
      verificationStatus: organizations.verificationStatus }).from(organizations).orderBy(desc(organizations.createdAt));
  }

  async history(organizationId: string, userId: string) {
    const [staff] = await this.db.select().from(platformRoles).where(eq(platformRoles.userId, userId));
    if (!staff?.roles.some(role => role === "ADMIN" || role === "RESOLVER"))
      throw new ForbiddenException("Current ADMIN or RESOLVER role required for verification reports");
    const records = await this.db.select().from(organizationVerificationRecords)
      .where(eq(organizationVerificationRecords.organizationId, organizationId))
      .orderBy(desc(organizationVerificationRecords.createdAt), desc(organizationVerificationRecords.id));
    for (const row of records) if (sha256(row.reportBytes) !== row.hash) throw new BadRequestException("Verification report bytes/hash mismatch");
    return records.map(row => ({ ...row, authority: "OFFCHAIN_VERIFICATION", onchainAction: null }));
  }

  async record(organizationId: string, userId: string, input: unknown) {
    const parsed = organizationVerificationSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.db.transaction(async tx => {
      const [staff] = await tx.select().from(platformRoles).where(eq(platformRoles.userId, userId)).for("share");
      if (!staff?.roles.includes("ADMIN")) throw new ForbiddenException("Current ADMIN role required for organization verification");
      const [organization] = await tx.select().from(organizations).where(eq(organizations.id, organizationId)).for("update");
      if (!organization) throw new NotFoundException("Organization not found");
      const [owner] = await tx.select().from(organizationMembers).where(and(eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId), eq(organizationMembers.role, "OWNER"))).for("share");
      if (owner) throw new ForbiddenException("Cannot verify an organization you own");
      await this.chain.verifyDeployment();
      const block = await this.chain.client.getBlock();
      const validUntil = new Date(parsed.data.validUntil);
      if (parsed.data.status === "VERIFIED" && BigInt(Math.floor(validUntil.getTime() / 1000)) <= block.timestamp)
        throw new BadRequestException("Verification validity must extend beyond current chain time");
      const [previous] = await tx.select().from(organizationVerificationRecords)
        .where(eq(organizationVerificationRecords.organizationId, organizationId))
        .orderBy(desc(organizationVerificationRecords.createdAt), desc(organizationVerificationRecords.id)).limit(1);
      // Serialized organization lock makes append ordering deterministic even in the same millisecond.
      const createdAt = new Date(Math.max(Date.now(), (previous?.createdAt.getTime() ?? 0) + 1));
      const reportBytes = JSON.stringify({ schemaVersion: "advance.organization-verification.v1", context: this.chain.context,
        organizationId, checkedBy: userId, createdAt: createdAt.toISOString(),
        checkedBlock: block.number.toString(), checkedBlockHash: block.hash, ...parsed.data });
      const [record] = await tx.insert(organizationVerificationRecords).values({ organizationId, status: parsed.data.status,
        reportBytes, hash: sha256(reportBytes), checkedBy: userId, validUntil, createdAt }).returning();
      await tx.update(organizations).set({ verificationStatus: parsed.data.status === "VERIFIED" ? "verified" : "revoked",
        updatedAt: createdAt }).where(eq(organizations.id, organizationId));
      return { ...record, authority: "OFFCHAIN_VERIFICATION", onchainAction: null };
    });
  }

  async latest(organizationId: string, chainTimestamp: bigint) {
    const [record] = await this.db.select().from(organizationVerificationRecords)
      .where(eq(organizationVerificationRecords.organizationId, organizationId))
      .orderBy(desc(organizationVerificationRecords.createdAt), desc(organizationVerificationRecords.id)).limit(1);
    if (!record || record.status !== "VERIFIED" || BigInt(Math.floor(record.validUntil.getTime() / 1000)) <= chainTimestamp)
      return { verified: false as const, record: record ?? null, requiredAction: "RESOLVER_STOP_OR_REVERIFY" };
    if (sha256(record.reportBytes) !== record.hash) throw new BadRequestException("Verification report bytes/hash mismatch");
    const report = JSON.parse(record.reportBytes);
    if (report.organizationId !== organizationId || report.status !== record.status || report.checkedBy !== record.checkedBy
      || new Date(report.validUntil).getTime() !== record.validUntil.getTime())
      throw new BadRequestException("Verification fields differ from committed report");
    if (JSON.stringify(report.context) !== JSON.stringify(this.chain.context))
      return { verified: false as const, record, requiredAction: "RESOLVER_STOP_OR_REVERIFY" };
    return { verified: true as const, record, requiredAction: null };
  }
}
