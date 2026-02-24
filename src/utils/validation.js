import { z } from 'zod';

export const isoDateSchema = z.string().datetime({ offset: true });

export const decimalAmountSchema = z
  .union([z.number(), z.string()])
  .transform((value) => Number(value))
  .refine((value) => Number.isFinite(value), 'Amount must be a valid number');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be in YYYY-MM format');

export function parseMonth(monthString) {
  const parsed = monthSchema.parse(monthString);
  return new Date(`${parsed}-01T00:00:00.000Z`);
}
