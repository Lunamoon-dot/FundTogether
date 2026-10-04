import { z } from "zod";

export const createOrganizationSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(10000),
  })
  .strict();

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const bindOrganizationWalletSchema = z
  .object({
    address: z
      .string()
      .regex(/^0x[\da-fA-F]{40}$/)
      .transform((value) => value.toLowerCase()),
    chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export type BindOrganizationWalletInput = z.infer<
  typeof bindOrganizationWalletSchema
>;
