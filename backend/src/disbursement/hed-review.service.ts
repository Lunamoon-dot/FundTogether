import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { hedReviewSchema } from "./hed-review.schema";

@Injectable()
export class HedReviewService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>) {}

  private async resolver(userId: string) {
    const [role] = await this.db.select().from(schema.platformRoles).where(eq(schema.platformRoles.userId, userId));
    if (!role?.roles.includes("RESOLVER")) throw new ForbiddenException("Current RESOLVER role required for HED review");
  }

  async list(requestId: string, userId: string) {
    await this.resolver(userId);
    return this.db.select().from(schema.hedRequestReviews).where(eq(schema.hedRequestReviews.requestDraftId, requestId))
      .orderBy(desc(schema.hedRequestReviews.createdAt));
  }

  async record(requestId: string, userId: string, input: unknown) {
    await this.resolver(userId);
    const parsed = hedReviewSchema.safeParse(input);
    if (!parsed.success) throw new ConflictException(parsed.error.flatten());
    const [request] = await this.db.select().from(schema.hedRequestDrafts).where(eq(schema.hedRequestDrafts.id, requestId));
    if (!request) throw new NotFoundException("HED request draft not found");
    if (!request.frozenAt || !request.requestHash) throw new ConflictException("Freeze HED request evidence before recording a review");
    return this.db.insert(schema.hedRequestReviews).values({ requestDraftId: requestId, content: parsed.data, reviewedBy: userId }).returning();
  }
}
