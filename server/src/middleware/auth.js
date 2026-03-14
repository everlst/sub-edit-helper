import jwt from 'jsonwebtoken';
import { deriveJwtSecret } from '../utils/crypto.js';
import { getDb } from '../db/index.js';

const JWT_EXPIRY = '7d';

/**
 * Generate a JWT token for the admin.
 */
export function signToken() {
  const secret = deriveJwtSecret();
  return jwt.sign({ role: 'admin' }, secret, { expiresIn: JWT_EXPIRY });
}

/**
 * Verify and decode a JWT token.
 */
export function verifyToken(token) {
  const secret = deriveJwtSecret();
  return jwt.verify(token, secret);
}

/**
 * Fastify hook: require a valid JWT from cookie or Authorization header.
 * Attach to routes that need admin authentication.
 */
export async function requireAuth(request, reply) {
  let token = request.cookies?.auth_token;

  if (!token) {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    reply.code(401).send({ error: 'Authentication required' });
    return;
  }

  try {
    const decoded = verifyToken(token);
    request.user = decoded;
  } catch {
    reply.code(401).send({ error: 'Invalid or expired token' });
  }
}

/**
 * Check whether the admin has been set up (password exists in settings).
 */
export function isAdminSetup() {
  const db = getDb();
  const row = db.select('value').from('settings').where('key', 'admin_password_hash').first();
  return row;
}
