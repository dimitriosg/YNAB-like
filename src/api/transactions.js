import { z } from 'zod';
import { prisma } from '../db.js';
import { decimalAmountSchema, isoDateSchema, paginationSchema } from '../utils/validation.js';

const listSchema = paginationSchema.extend({
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional()
});

const createSchema = z.object({
  accountId: z.string().min(1),
  categoryId: z.string().optional().nullable(),
  date: isoDateSchema,
  payee: z.string().optional().nullable(),
  amount: decimalAmountSchema,
  memo: z.string().optional().nullable(),
  cleared: z.boolean().optional()
});

const patchSchema = createSchema.partial();

function spendingAmount(categoryId, amount) {
  return categoryId && amount > 0 ? amount : 0;
}

async function ensureCategoryAvailability(tx, userId, categoryId, spendAmount, previousSpend = 0) {
  if (!categoryId || spendAmount <= 0) return;
  const category = await tx.category.findFirst({
    where: { id: categoryId, budgetMonth: { userId } },
    include: { budgetMonth: true }
  });
  if (!category) throw new Error('Category not found');

  const available = Number(category.assigned) - (Number(category.spent) - previousSpend);
  if (spendAmount > available) throw new Error('Spending exceeds available category funds');
}

export function createTransactionsHandler() {
  return {
    async list(userId, query) {
      const input = listSchema.parse(query ?? {});
      const where = {
        account: { userId },
        ...(input.accountId ? { accountId: input.accountId } : {}),
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        ...((input.dateFrom || input.dateTo)
          ? {
              date: {
                ...(input.dateFrom ? { gte: new Date(input.dateFrom) } : {}),
                ...(input.dateTo ? { lte: new Date(input.dateTo) } : {})
              }
            }
          : {})
      };

      const [items, total] = await prisma.$transaction([
        prisma.transaction.findMany({
          where,
          orderBy: { date: 'desc' },
          skip: (input.page - 1) * input.limit,
          take: input.limit
        }),
        prisma.transaction.count({ where })
      ]);

      return { status: 200, body: { items, total, page: input.page, limit: input.limit } };
    },

    async create(userId, payload) {
      const input = createSchema.parse(payload);
      const spend = spendingAmount(input.categoryId, input.amount);

      const result = await prisma.$transaction(async (tx) => {
        const account = await tx.account.findFirst({ where: { id: input.accountId, userId } });
        if (!account) return { status: 404, body: { error: 'Account not found' } };

        await ensureCategoryAvailability(tx, userId, input.categoryId, spend);

        const created = await tx.transaction.create({
          data: { ...input, amount: input.amount, date: new Date(input.date) }
        });

        await tx.account.update({ where: { id: account.id }, data: { balance: { decrement: input.amount } } });
        if (spend > 0) {
          await tx.category.update({ where: { id: input.categoryId }, data: { spent: { increment: spend } } });
        }

        return { status: 201, body: created };
      });

      return result;
    },

    async patch(userId, transactionId, payload) {
      const input = patchSchema.parse(payload);

      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.transaction.findFirst({
          where: { id: transactionId, account: { userId } }
        });
        if (!existing) return { status: 404, body: { error: 'Transaction not found' } };

        const next = {
          accountId: input.accountId ?? existing.accountId,
          categoryId: input.categoryId === undefined ? existing.categoryId : input.categoryId,
          amount: input.amount ?? Number(existing.amount),
          date: input.date ? new Date(input.date) : existing.date,
          payee: input.payee === undefined ? existing.payee : input.payee,
          memo: input.memo === undefined ? existing.memo : input.memo,
          cleared: input.cleared ?? existing.cleared
        };

        const oldSpend = spendingAmount(existing.categoryId, Number(existing.amount));
        const newSpend = spendingAmount(next.categoryId, next.amount);
        await ensureCategoryAvailability(tx, userId, next.categoryId, newSpend, next.categoryId === existing.categoryId ? oldSpend : 0);

        const updated = await tx.transaction.update({
          where: { id: transactionId },
          data: {
            accountId: next.accountId,
            categoryId: next.categoryId,
            amount: next.amount,
            date: next.date,
            payee: next.payee,
            memo: next.memo,
            cleared: next.cleared
          }
        });

        if (next.accountId === existing.accountId) {
          await tx.account.update({
            where: { id: existing.accountId },
            data: { balance: { increment: Number(existing.amount) - next.amount } }
          });
        } else {
          const nextAccount = await tx.account.findFirst({ where: { id: next.accountId, userId } });
          if (!nextAccount) return { status: 404, body: { error: 'New account not found' } };
          await tx.account.update({ where: { id: existing.accountId }, data: { balance: { increment: Number(existing.amount) } } });
          await tx.account.update({ where: { id: next.accountId }, data: { balance: { decrement: next.amount } } });
        }

        if (existing.categoryId && oldSpend > 0) {
          await tx.category.update({ where: { id: existing.categoryId }, data: { spent: { decrement: oldSpend } } });
        }
        if (next.categoryId && newSpend > 0) {
          await tx.category.update({ where: { id: next.categoryId }, data: { spent: { increment: newSpend } } });
        }

        return { status: 200, body: updated };
      });

      return result;
    },

    async remove(userId, transactionId) {
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.transaction.findFirst({
          where: { id: transactionId, account: { userId } }
        });
        if (!existing) return { status: 404, body: { error: 'Transaction not found' } };

        const oldSpend = spendingAmount(existing.categoryId, Number(existing.amount));
        await tx.account.update({ where: { id: existing.accountId }, data: { balance: { increment: Number(existing.amount) } } });
        if (existing.categoryId && oldSpend > 0) {
          await tx.category.update({ where: { id: existing.categoryId }, data: { spent: { decrement: oldSpend } } });
        }
        await tx.transaction.delete({ where: { id: transactionId } });

        return { status: 200, body: { success: true } };
      });

      return result;
    }
  };
}

/**
 * curl -X GET "http://localhost:3000/api/transactions?page=1&limit=20" -H "Authorization: Bearer <token>"
 * curl -X POST http://localhost:3000/api/transactions -H "Authorization: Bearer <token>" -H "content-type: application/json" -d '{"accountId":"<accountId>","categoryId":"<categoryId>","date":"2026-01-01T00:00:00.000Z","amount":10.5}'
 * curl -X PATCH http://localhost:3000/api/transactions/<id> -H "Authorization: Bearer <token>" -H "content-type: application/json" -d '{"memo":"updated"}'
 * curl -X DELETE http://localhost:3000/api/transactions/<id> -H "Authorization: Bearer <token>"
 */
