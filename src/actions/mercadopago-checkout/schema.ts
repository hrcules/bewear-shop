import { z } from "zod";
export const mpCheckoutSchema = z.object({
  requestKey: z.string().uuid(),
  direct: z
    .object({
      variantId: z.string().uuid(),
      addressId: z.string().uuid(),
      quantity: z.number().int().positive().max(999),
    })
    .optional(),
});
export type MpCheckoutInput = z.infer<typeof mpCheckoutSchema>;
