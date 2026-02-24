import { z } from 'zod';
import { prisma } from '../db.js';
import { assignMoney } from '../budget-engine.js';

const categoryCreateSchema = z.object({
  name: z.string().min(1),
  group: z.string().optional()
});

const assignSchema = z.object({
  amount: z.number().nonnegative()
});

function parseMonth(monthString) {
  const month = new Date(`${monthString}-01T00:00:00.000Z`);
  if (Number.isNaN(month.getTime())) throw new Error('Invalid month format; expected YYYY-MM');
  return month;
}

export function createCategoriesHandler() {
  return {
    async list(userId, monthString) {
      const month = parseMonth(monthString);
      const budget = await prisma.budgetMonth.findUnique({
        where: { userId_month: { userId, month } },
        include: { categories: true }
      });
      return { status: 200, body: budget?.categories ?? [] };
    },

    async create(userId, monthString, payload) {
      const month = parseMonth(monthString);
      const input = categoryCreateSchema.parse(payload);

      const created = await prisma.$transaction(async (tx) => {
        const budget = await tx.budgetMonth.upsert({
          where: { userId_month: { userId, month } },
          update: {},
          create: { userId, month }
        });

        return tx.category.create({
          data: { budgetMonthId: budget.id, ...input }
        });
      });

      return { status: 201, body: created };
    },

    async assign(userId, monthString, categoryId, payload) {
      const month = parseMonth(monthString);
      const input = assignSchema.parse(payload);

      const result = await prisma.$transaction(async (tx) => {
        const budget = await tx.budgetMonth.findUnique({
          where: { userId_month: { userId, month } }
        });
        if (!budget) return { status: 404, body: { error: 'Budget month not found' } };

        const category = await tx.category.findFirst({
          where: { id: categoryId, budgetMonthId: budget.id }
        });
        if (!category) return { status: 404, body: { error: 'Category not found' } };

        const engine = assignMoney({
          availableToBudget: Number(budget.availableToBudget),
          assigned: input.amount
        });

        const updatedBudget = await tx.budgetMonth.update({
          where: { id: budget.id },
          data: { availableToBudget: engine.availableToBudget }
        });

        const updatedCategory = await tx.category.update({
          where: { id: category.id },
          data: { assigned: { increment: input.amount } }
        });

        return { status: 200, body: { budgetMonth: updatedBudget, category: updatedCategory } };
      });

      return result;
    }
  };
}
