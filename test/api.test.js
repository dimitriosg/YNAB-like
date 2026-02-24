import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

import { prisma } from '../src/db.js';
import { assignMoney } from '../src/budget-engine.js';
import { createAuthHandler, verifyJwt } from '../src/api/auth.js';
import { createAccountsHandler } from '../src/api/accounts.js';
import { createCategoriesHandler } from '../src/api/categories.js';

test('assignMoney subtracts from availableToBudget', () => {
  const result = assignMoney({ availableToBudget: 100, assigned: 40 });
  assert.deepEqual(result, { assigned: 40, availableToBudget: 60 });
});

test('auth register/login flow with mocked prisma', async () => {
  const auth = createAuthHandler();
  let stored;

  prisma.user.findUnique = async ({ where }) => {
    if (where.email === 'exists@example.com') return { id: 'u1', email: where.email, password: stored?.password };
    if (where.email === 'new@example.com') return stored ?? null;
    return null;
  };
  prisma.user.create = async ({ data }) => {
    stored = { id: 'u2', email: data.email, password: data.password, createdAt: new Date() };
    return { id: stored.id, email: stored.email, createdAt: stored.createdAt };
  };

  const reg = await auth.register({ email: 'new@example.com', password: 'password123' });
  assert.equal(reg.status, 201);

  const login = await auth.login({ email: 'new@example.com', password: 'password123' });
  assert.equal(login.status, 200);
  assert.ok(login.body.token);
});

test('verifyJwt middleware sets req.user', () => {
  const token = jwt.sign({ sub: 'u1' }, process.env.JWT_SECRET || 'dev-secret');
  const req = { headers: { authorization: `Bearer ${token}` } };
  let called = false;
  const res = { status: () => ({ json: () => {} }) };
  verifyJwt(req, res, () => {
    called = true;
  });
  assert.equal(called, true);
  assert.equal(req.user.sub, 'u1');
});

test('accounts handler create/list/patch with mocked prisma', async () => {
  const accounts = createAccountsHandler();
  const rows = [];

  prisma.account.findMany = async () => rows;
  prisma.$transaction = async (fn) => fn({
    account: {
      create: async ({ data }) => {
        const row = { id: 'a1', ...data };
        rows.push(row);
        return row;
      },
      findFirst: async ({ where }) => rows.find((r) => r.id === where.id && r.userId === where.userId) ?? null,
      update: async ({ where, data }) => {
        const row = rows.find((r) => r.id === where.id);
        Object.assign(row, data);
        return row;
      }
    }
  });

  await accounts.create('u1', { name: 'Checking', type: 'checking', balance: 10 });
  const list = await accounts.list('u1');
  assert.equal(list.body.length, 1);

  const patched = await accounts.patch('u1', 'a1', { name: 'Main Checking' });
  assert.equal(patched.body.name, 'Main Checking');
});

test('categories assign updates budget and category via mocked prisma tx', async () => {
  const categories = createCategoriesHandler();

  const budget = { id: 'b1', userId: 'u1', month: new Date('2024-01-01T00:00:00.000Z'), availableToBudget: 100 };
  const category = { id: 'c1', budgetMonthId: 'b1', assigned: 0 };

  prisma.$transaction = async (fn) => fn({
    budgetMonth: {
      findUnique: async () => budget,
      upsert: async () => budget,
      update: async ({ data }) => ({ ...budget, ...data })
    },
    category: {
      create: async ({ data }) => ({ id: 'c2', ...data }),
      findFirst: async () => category,
      update: async ({ data }) => ({ ...category, assigned: category.assigned + data.assigned.increment })
    }
  });

  const result = await categories.assign('u1', '2024-01', 'c1', { amount: 20 });
  assert.equal(result.status, 200);
  assert.equal(Number(result.body.budgetMonth.availableToBudget), 80);
  assert.equal(result.body.category.assigned, 20);
});
