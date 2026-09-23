import { z } from "zod";
export const connectionCommandSchema = z.enum([
  "enable",
  "disable",
  "disconnect",
]);
