import { z } from "zod";

export const updateStoreSettingsSchema = z.object({
  name: z.string().min(1, "O nome da loja é obrigatório"),
  colorPrimary: z
    .string()
    .regex(/^#([0-9A-F]{3}){1,2}$/i, "Cor hexadecimal inválida"),
  logoUrl: z.string().optional().nullable(),
  banner1DesktopUrl: z.string().optional().nullable(),
  banner1MobileUrl: z.string().optional().nullable(),
  banner2DesktopUrl: z.string().optional().nullable(),
  banner2MobileUrl: z.string().optional().nullable(),
  instagramUrl: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  fixedShippingFee: z.string().min(1, "O valor do frete é obrigatório"),
  freeShippingThreshold: z.string().optional().nullable(),
});

export const updateOnlinePaymentsSchema = z.object({
  enabled: z.boolean(),
});

export type UpdateStoreSettingsInput = z.infer<
  typeof updateStoreSettingsSchema
>;

export type UpdateOnlinePaymentsInput = z.infer<
  typeof updateOnlinePaymentsSchema
>;
