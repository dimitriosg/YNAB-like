import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../db.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const loginSchema = registerSchema;

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-secret';
}

export async function register(payload) {
  const input = registerSchema.parse(payload);
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    return { status: 409, body: { error: 'Email already registered' } };
  }

  const password = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: { email: input.email, password },
    select: { id: true, email: true, createdAt: true }
  });

  return { status: 201, body: user };
}

export async function login(payload) {
  const input = loginSchema.parse(payload);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    return { status: 401, body: { error: 'Invalid credentials' } };
  }

  const ok = await bcrypt.compare(input.password, user.password);
  if (!ok) {
    return { status: 401, body: { error: 'Invalid credentials' } };
  }

  const token = jwt.sign({ sub: user.id, email: user.email }, getJwtSecret(), {
    expiresIn: '1h'
  });

  return { status: 200, body: { token } };
}

export function verifyJwt(req, res, next) {
  const auth = req.headers?.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }

  try {
    req.user = jwt.verify(auth.slice(7), getJwtSecret());
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Example curl commands:
 * curl -X POST http://localhost:3000/api/auth/register -H "content-type: application/json" -d '{"email":"demo@example.com","password":"password123"}'
 * curl -X POST http://localhost:3000/api/auth/login -H "content-type: application/json" -d '{"email":"demo@example.com","password":"password123"}'
 */
export function createAuthHandler() {
  return {
    async register(reqBody) {
      return register(reqBody);
    },
    async login(reqBody) {
      return login(reqBody);
    },
    verifyJwt
  };
}
