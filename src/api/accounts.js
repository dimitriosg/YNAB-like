import { z } from 'zod';
import { prisma } from '../db.js';

const accountCreateSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['checking', 'savings', 'credit']),
  balance: z.number().default(0)
});

const accountPatchSchema = z.object({
  name: z.string().min(1).optional(),
  balance: z.number().optional()
});

export function createAccountsHandler() {
  return {
    async list(userId) {
      const accounts = await prisma.account.findMany({ where: { userId }, orderBy: { name: 'asc' } });
      return { status: 200, body: accounts };
    },

    async create(userId, payload) {
      const input = accountCreateSchema.parse(payload);
      const created = await prisma.$transaction((tx) =>
        tx.account.create({
          data: { userId, ...input }
        })
      );
      return { status: 201, body: created };
    },

    async patch(userId, accountId, payload) {
      const input = accountPatchSchema.parse(payload);
      const updated = await prisma.$transaction(async (tx) => {
        const account = await tx.account.findFirst({ where: { id: accountId, userId } });
        if (!account) return null;
        return tx.account.update({ where: { id: accountId }, data: input });
      });

      if (!updated) return { status: 404, body: { error: 'Account not found' } };
      return { status: 200, body: updated };
    }
  };
}
