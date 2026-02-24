import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { assignMoney } from '../src/budget-engine.js';
import { createApp } from '../src/server.js';
import { prisma } from '../src/db.js';

function buildMockPrisma() {
  const users = [];
  const accounts = [];
  const budgets = [];
  const categories = [];
  const transactions = [];

  const findBudget = (userId, month) => budgets.find((b) => b.userId === userId && b.month.toISOString() === month.toISOString()) ?? null;

  prisma.user.findUnique = async ({ where }) => users.find((u) => u.email === where.email) ?? null;
  prisma.user.create = async ({ data, select }) => {
    const row = { id: `u${users.length + 1}`, email: data.email, password: data.password, createdAt: new Date() };
    users.push(row);
    if (!select) return row;
    return { id: row.id, email: row.email, createdAt: row.createdAt };
  };

  prisma.account.findMany = async ({ where }) => accounts.filter((a) => a.userId === where.userId);
  prisma.transaction.findMany = async ({ where }) => transactions.filter((t) => {
    const account = accounts.find((a) => a.id === t.accountId);
    if (!account || account.userId !== where.account.userId) return false;
    if (where.accountId && t.accountId !== where.accountId) return false;
    if (where.categoryId && t.categoryId !== where.categoryId) return false;
    return true;
  });
  prisma.transaction.count = async ({ where }) => (await prisma.transaction.findMany({ where })).length;

  prisma.$transaction = async (arg) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    return arg({
      account: {
        create: async ({ data }) => {
          const row = { id: `a${accounts.length + 1}`, ...data };
          accounts.push(row);
          return row;
        },
        findFirst: async ({ where }) => accounts.find((a) => a.id === where.id && a.userId === where.userId) ?? null,
        update: async ({ where, data }) => {
          const row = accounts.find((a) => a.id === where.id);
          if (data.balance?.decrement !== undefined) row.balance -= data.balance.decrement;
          if (data.balance?.increment !== undefined) row.balance += data.balance.increment;
          if (typeof data.balance === 'number') row.balance = data.balance;
          if (data.name) row.name = data.name;
          return row;
        }
      },
      budgetMonth: {
        findUnique: async ({ where }) => {
          if (where.userId_month) return findBudget(where.userId_month.userId, where.userId_month.month);
          return budgets.find((b) => b.id === where.id) ?? null;
        },
        upsert: async ({ where, create }) => {
          const existing = findBudget(where.userId_month.userId, where.userId_month.month);
          if (existing) return existing;
          const row = { id: `b${budgets.length + 1}`, availableToBudget: 0, carryoverFromPrev: 0, ...create };
          budgets.push(row);
          return row;
        },
        update: async ({ where, data }) => {
          const row = budgets.find((b) => b.id === where.id);
          Object.assign(row, data);
          return row;
        }
      },
      category: {
        create: async ({ data }) => {
          const row = { id: `c${categories.length + 1}`, assigned: 0, spent: 0, ...data };
          categories.push(row);
          return row;
        },
        findFirst: async ({ where }) => categories.find((c) => {
          if (where.id && c.id !== where.id) return false;
          if (where.budgetMonthId && c.budgetMonthId !== where.budgetMonthId) return false;
          if (where.budgetMonth?.userId) {
            const budget = budgets.find((b) => b.id === c.budgetMonthId);
            return budget?.userId === where.budgetMonth.userId;
          }
          return true;
        }) ?? null,
        update: async ({ where, data }) => {
          const row = categories.find((c) => c.id === where.id);
          if (data.assigned?.increment) row.assigned += data.assigned.increment;
          if (data.spent?.increment) row.spent += data.spent.increment;
          if (data.spent?.decrement) row.spent -= data.spent.decrement;
          return row;
        }
      },
      transaction: {
        create: async ({ data }) => {
          const row = { id: `t${transactions.length + 1}`, cleared: false, ...data };
          transactions.push(row);
          return row;
        },
        findFirst: async ({ where }) => transactions.find((t) => t.id === where.id && accounts.find((a) => a.id === t.accountId)?.userId === where.account.userId) ?? null,
        update: async ({ where, data }) => {
          const row = transactions.find((t) => t.id === where.id);
          Object.assign(row, data);
          return row;
        },
        delete: async ({ where }) => {
          const idx = transactions.findIndex((t) => t.id === where.id);
          transactions.splice(idx, 1);
        }
      }
    });
  };

  return { accounts, categories, budgets };
}

test('assignMoney subtracts from availableToBudget', () => {
  assert.deepEqual(assignMoney({ availableToBudget: 100, assigned: 40 }), { assigned: 40, availableToBudget: 60 });
});

test('api flow: register -> account -> category assign -> transaction updates balances', async () => {
  const state = buildMockPrisma();
  const app = createApp();

  const register = await request(app).post('/api/auth/register').send({ email: 'test@example.com', password: 'password123' });
  assert.equal(register.status, 201);

  const login = await request(app).post('/api/auth/login').send({ email: 'test@example.com', password: 'password123' });
  const token = login.body.token;
  assert.ok(token);

  const account = await request(app)
    .post('/api/accounts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Checking', type: 'checking', balance: 100 });
  assert.equal(account.status, 201);

  const category = await request(app)
    .post('/api/categories?month=2026-01')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Groceries' });
  assert.equal(category.status, 201);

  const assigned = await request(app)
    .post(`/api/categories/${category.body.id}/assign?month=2026-01`)
    .set('Authorization', `Bearer ${token}`)
    .send({ amount: 50 });
  assert.equal(assigned.status, 200);

  const tx = await request(app)
    .post('/api/transactions')
    .set('Authorization', `Bearer ${token}`)
    .send({
      accountId: account.body.id,
      categoryId: category.body.id,
      date: '2026-01-05T00:00:00.000Z',
      amount: 20,
      payee: 'Store'
    });
  assert.equal(tx.status, 201);

  assert.equal(state.accounts[0].balance, 80);
  assert.equal(state.categories[0].spent, 20);
});
