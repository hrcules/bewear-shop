import { z } from "zod";
export const reconcileSchema = z.object({
  orderId: z.string().uuid(),
  cancel: z.boolean().default(false),
});
