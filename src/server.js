import { createAuthHandler } from './api/auth.js';
import { createAccountsHandler } from './api/accounts.js';
import { createCategoriesHandler } from './api/categories.js';

export function createApiHandlers() {
  return {
    auth: createAuthHandler(),
    accounts: createAccountsHandler(),
    categories: createCategoriesHandler()
  };
}

if (process.env.NODE_ENV !== 'test') {
  // Placeholder entrypoint for nodemon-based local development.
  console.log('YNAB-like API handlers ready. Integrate with Express/Fastify in this file.');
}
