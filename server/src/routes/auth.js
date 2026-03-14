import bcrypt from 'bcryptjs';
import { getDb } from '../db/index.js';
import { signToken, verifyToken } from '../middleware/auth.js';

export async function authRoutes(app) {
  /**
   * GET /api/auth/status
   * Check if admin has been set up.
   */
  app.get('/status', async () => {
    const db = getDb();
    const row = await db('settings').where('key', 'admin_password_hash').first();
    return { initialized: !!row?.value };
  });

  /**
   * POST /api/auth/setup
   * First-time admin password setup. Also used for password change (requires auth).
   */
  app.post('/setup', async (request, reply) => {
    const db = getDb();
    const existing = await db('settings').where('key', 'admin_password_hash').first();

    // If already initialized, require authentication for password change
    if (existing?.value) {
      let token = request.cookies?.auth_token;
      if (!token) {
        const authHeader = request.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
          token = authHeader.slice(7);
        }
      }
      if (!token) {
        return reply.code(401).send({ error: 'Authentication required to change password' });
      }
      try {
        verifyToken(token);
      } catch {
        return reply.code(401).send({ error: 'Invalid or expired token' });
      }
    }

    const { password } = request.body || {};
    if (!password || password.length < 6) {
      return reply.code(400).send({ error: 'Password must be at least 6 characters' });
    }

    const hash = await bcrypt.hash(password, 12);

    // Upsert setting
    if (existing) {
      await db('settings').where('key', 'admin_password_hash').update({ value: hash });
    } else {
      await db('settings').insert({ key: 'admin_password_hash', value: hash });
    }

    const jwtToken = signToken();
    reply.setCookie('auth_token', jwtToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return { success: true, token: jwtToken };
  });

  /**
   * POST /api/auth/login
   * Admin login. Supports env ADMIN_PASSWORD override.
   */
  app.post('/login', async (request, reply) => {
    const { password } = request.body || {};
    if (!password) {
      return reply.code(400).send({ error: 'Password is required' });
    }

    // Check env override first
    if (process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) {
      const token = signToken();
      reply.setCookie('auth_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      });
      return { success: true, token };
    }

    const db = getDb();
    const row = await db('settings').where('key', 'admin_password_hash').first();

    if (!row?.value) {
      return reply.code(403).send({ error: 'Admin not initialized. Use /api/auth/setup first.' });
    }

    const valid = await bcrypt.compare(password, row.value);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid password' });
    }

    const token = signToken();
    reply.setCookie('auth_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return { success: true, token };
  });

  /**
   * POST /api/auth/logout
   */
  app.post('/logout', async (_request, reply) => {
    reply.clearCookie('auth_token', { path: '/' });
    return { success: true };
  });
}
