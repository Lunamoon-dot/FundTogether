import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../../database/database.constants";
import * as schema from "../../database/schema";
import {
  organizationMembers,
  organizations,
} from "../../database/schema/organizations.schema";
import { walletLinks } from "../../database/schema/users.schema";
import type {
  BindOrganizationWalletInput,
  CreateOrganizationInput,
} from "./organization.schema";

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly database: NodePgDatabase<typeof schema>,
  ) {}

  async create(userId: string, input: CreateOrganizationInput) {
    return this.database.transaction(async (transaction) => {
      const [organization] = await transaction
        .insert(organizations)
        .values({ ...input, createdByUserId: userId })
        .returning();
      const [membership] = await transaction
        .insert(organizationMembers)
        .values({ organizationId: organization.id, userId, role: "OWNER" })
        .returning({ role: organizationMembers.role });
      return {
        ...organization,
        representativeWallet: null,
        role: membership.role,
      };
    });
  }

  async list(userId: string) {
    const rows = await this.database
      .select({
        id: organizations.id,
        name: organizations.name,
        description: organizations.description,
        createdByUserId: organizations.createdByUserId,
        verificationStatus: organizations.verificationStatus,
        createdAt: organizations.createdAt,
        updatedAt: organizations.updatedAt,
        role: organizationMembers.role,
        representativeWallet: {
          address: walletLinks.address,
          chainId: walletLinks.chainId,
        },
      })
      .from(organizations)
      .innerJoin(
        organizationMembers,
        eq(organizationMembers.organizationId, organizations.id),
      )
      .leftJoin(
        walletLinks,
        eq(walletLinks.id, organizations.representativeWalletLinkId),
      )
      .where(eq(organizationMembers.userId, userId))
      .orderBy(desc(organizations.createdAt), desc(organizations.id));
    return rows.map((row) => ({
      ...row,
      representativeWallet: row.representativeWallet
        ? {
            address: row.representativeWallet.address,
            chainId: Number(row.representativeWallet.chainId),
          }
        : null,
    }));
  }

  async bindWallet(
    organizationId: string,
    userId: string,
    input: BindOrganizationWalletInput,
  ) {
    return this.database.transaction(async (transaction) => {
      // Serialize initial selection so concurrent requests cannot replace a wallet.
      const [organization] = await transaction
        .select()
        .from(organizations)
        .where(
          and(
            eq(organizations.id, organizationId),
            eq(organizations.createdByUserId, userId),
          ),
        )
        .for("update");
      if (!organization)
        throw new ForbiddenException(
          "Only the organization creator can select its wallet",
        );
      const [membership] = await transaction
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, organizationId),
            eq(organizationMembers.userId, userId),
            eq(organizationMembers.role, "OWNER"),
          ),
        )
        .for("share");
      if (!membership)
        throw new ForbiddenException("Organization OWNER membership required");
      const [wallet] = await transaction
        .select()
        .from(walletLinks)
        .where(
          and(
            eq(walletLinks.userId, userId),
            eq(walletLinks.address, input.address.toLowerCase()),
            eq(walletLinks.chainId, String(input.chainId)),
          ),
        )
        .for("share");
      if (!wallet)
        throw new ForbiddenException(
          "Select a verified wallet linked to your account",
        );
      if (
        organization.representativeWalletLinkId &&
        organization.representativeWalletLinkId !== wallet.id
      ) {
        throw new ConflictException(
          "Organization wallet is already selected; replacement is not supported",
        );
      }
      if (!organization.representativeWalletLinkId) {
        await transaction
          .update(organizations)
          .set({ representativeWalletLinkId: wallet.id, updatedAt: new Date() })
          .where(eq(organizations.id, organizationId));
      }
      return {
        organizationId,
        representativeWallet: {
          address: wallet.address,
          chainId: Number(wallet.chainId),
        },
      };
    });
  }
}
