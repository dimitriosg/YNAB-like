import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { ZodError } from 'zod';

import { createAuthHandler, verifyJwt } from './api/auth.js';
import { createAccountsHandler } from './api/accounts.js';
import { createCategoriesHandler } from './api/categories.js';
import { createTransactionsHandler } from './api/transactions.js';

function wrap(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

export function createApp() {
  const app = express();
  const auth = createAuthHandler();
  const accounts = createAccountsHandler();
  const categories = createCategoriesHandler();
  const transactions = createTransactionsHandler();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.post('/api/auth/register', wrap(async (req, res) => {
    const result = await auth.register(req.body);
    res.status(result.status).json(result.body);
  }));

  app.post('/api/auth/login', wrap(async (req, res) => {
    const result = await auth.login(req.body);
    res.status(result.status).json(result.body);
  }));

  app.use('/api', verifyJwt);

  app.get('/api/accounts', wrap(async (req, res) => {
    const result = await accounts.list(req.user.sub);
    res.status(result.status).json(result.body);
  }));

  app.post('/api/accounts', wrap(async (req, res) => {
    const result = await accounts.create(req.user.sub, req.body);
    res.status(result.status).json(result.body);
  }));

  app.patch('/api/accounts/:id', wrap(async (req, res) => {
    const result = await accounts.patch(req.user.sub, req.params.id, req.body);
    res.status(result.status).json(result.body);
  }));

  app.get('/api/categories', wrap(async (req, res) => {
    const result = await categories.list(req.user.sub, req.query.month);
    res.status(result.status).json(result.body);
  }));

  app.post('/api/categories', wrap(async (req, res) => {
    const result = await categories.create(req.user.sub, req.query.month, req.body);
    res.status(result.status).json(result.body);
  }));

  app.post('/api/categories/:id/assign', wrap(async (req, res) => {
    const result = await categories.assign(req.user.sub, req.query.month, req.params.id, req.body);
    res.status(result.status).json(result.body);
  }));

  app.get('/api/transactions', wrap(async (req, res) => {
    const result = await transactions.list(req.user.sub, req.query);
    res.status(result.status).json(result.body);
  }));

  app.post('/api/transactions', wrap(async (req, res) => {
    const result = await transactions.create(req.user.sub, req.body);
    res.status(result.status).json(result.body);
  }));

  app.patch('/api/transactions/:id', wrap(async (req, res) => {
    const result = await transactions.patch(req.user.sub, req.params.id, req.body);
    res.status(result.status).json(result.body);
  }));

  app.delete('/api/transactions/:id', wrap(async (req, res) => {
    const result = await transactions.remove(req.user.sub, req.params.id);
    res.status(result.status).json(result.body);
  }));

  app.use((err, _req, res, _next) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.flatten() });
      return;
    }

    if (err?.message?.includes('not found')) {
      res.status(404).json({ error: err.message });
      return;
    }

    if (err?.message?.includes('exceeds available')) {
      res.status(422).json({ error: err.message });
      return;
    }

    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}



/**
 * curl -X POST http://localhost:3000/api/auth/register -H "content-type: application/json" -d '{"email":"demo@example.com","password":"password123"}'
 * curl -X POST http://localhost:3000/api/auth/login -H "content-type: application/json" -d '{"email":"demo@example.com","password":"password123"}'
 * curl -X GET http://localhost:3000/api/accounts -H "Authorization: Bearer <token>"
 * curl -X POST http://localhost:3000/api/accounts -H "Authorization: Bearer <token>" -H "content-type: application/json" -d '{"name":"Checking","type":"checking","balance":1000}'
 * curl -X GET "http://localhost:3000/api/categories?month=2026-01" -H "Authorization: Bearer <token>"
 * curl -X POST "http://localhost:3000/api/categories?month=2026-01" -H "Authorization: Bearer <token>" -H "content-type: application/json" -d '{"name":"Groceries"}'
 * curl -X POST "http://localhost:3000/api/categories/<categoryId>/assign?month=2026-01" -H "Authorization: Bearer <token>" -H "content-type: application/json" -d '{"amount":250}'
 * curl -X GET "http://localhost:3000/api/transactions?page=1&limit=20" -H "Authorization: Bearer <token>"
 * curl -X POST http://localhost:3000/api/transactions -H "Authorization: Bearer <token>" -H "content-type: application/json" -d '{"accountId":"<accountId>","categoryId":"<categoryId>","date":"2026-01-01T00:00:00.000Z","amount":25.5}'
 * curl -X PATCH http://localhost:3000/api/transactions/<id> -H "Authorization: Bearer <token>" -H "content-type: application/json" -d '{"memo":"Updated memo"}'
 * curl -X DELETE http://localhost:3000/api/transactions/<id> -H "Authorization: Bearer <token>"
 */

if (process.env.NODE_ENV !== 'test') {
  const app = createApp();
  app.listen(3000, () => {
    console.log('YNAB-like API listening on http://localhost:3000');
  });
}
