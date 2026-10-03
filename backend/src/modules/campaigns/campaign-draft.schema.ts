import { z } from "zod";

const criterionSchema = z
  .object({
    criterionId: z.string().trim().min(1).max(128),
    description: z.string().trim().min(1),
  })
  .strict();

const milestoneFields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1),
  acceptanceCriteria: z.array(criterionSchema).min(1),
};

const milestoneSchema = z
  .object({
    ...milestoneFields,
  })
  .strict()
  .refine(
    (milestone) =>
      new Set(milestone.acceptanceCriteria.map((item) => item.criterionId))
        .size === milestone.acceptanceCriteria.length,
    {
      message: "Criterion IDs must be unique within a milestone",
      path: ["acceptanceCriteria"],
    },
  );

export const createCampaignDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1),
    milestones: z.array(milestoneSchema).min(1),
  })
  .strict();

export type CreateCampaignDraftInput = z.infer<
  typeof createCampaignDraftSchema
>;

export const updateCampaignDraftSchema = createCampaignDraftSchema
  .extend({
    expectedRevision: z.number().int().min(1).max(2147483646),
    milestones: z
      .array(milestoneSchema.safeExtend({ id: z.string().uuid().optional() }))
      .min(1),
  })
  .refine(
    (input) => {
      const ids = input.milestones.flatMap((milestone) =>
        milestone.id ? [milestone.id] : [],
      );
      return new Set(ids).size === ids.length;
    },
    { message: "Milestone IDs must be unique", path: ["milestones"] },
  );

export type UpdateCampaignDraftInput = z.infer<
  typeof updateCampaignDraftSchema
>;
