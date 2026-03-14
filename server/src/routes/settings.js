import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

export async function settingsRoutes(app) {
  app.addHook('onRequest', requireAuth);

  /**
   * GET /api/settings
   * Return non-sensitive settings.
   */
  app.get('/', async () => {
    const db = getDb();
    const rows = await db('settings').select('key', 'value');

    const settings = {};
    for (const row of rows) {
      // Never return password hash
      if (row.key === 'admin_password_hash') continue;
      settings[row.key] = row.value;
    }

    return settings;
  });

  /**
   * PUT /api/settings
   * Update settings (key-value pairs).
   */
  app.put('/', async (request) => {
    const updates = request.body || {};
    const db = getDb();

    for (const [key, value] of Object.entries(updates)) {
      // Don't allow directly setting password hash via this endpoint
      if (key === 'admin_password_hash') continue;

      const existing = await db('settings').where('key', key).first();
      if (existing) {
        await db('settings').where('key', key).update({ value: String(value) });
      } else {
        await db('settings').insert({ key, value: String(value) });
      }
    }

    return { success: true };
  });

  /**
   * GET /api/settings/tokens
   * List publish tokens.
   */
  app.get('/tokens', async () => {
    const db = getDb();
    const tokens = await db('publish_tokens')
      .leftJoin('profiles', 'publish_tokens.profile_id', 'profiles.id')
      .select(
        'publish_tokens.id',
        'publish_tokens.token',
        'publish_tokens.enabled',
        'publish_tokens.profile_id',
        'profiles.name as profile_name',
        'publish_tokens.last_accessed_at',
        'publish_tokens.created_at',
      )
      .orderBy('publish_tokens.created_at', 'desc');
    return tokens;
  });

  /**
   * POST /api/settings/tokens
   * Generate a new publish token.
   */
  app.post('/tokens', async (request, reply) => {
    const db = getDb();
    const token = uuidv4();
    const [id] = await db('publish_tokens').insert({ token, enabled: true });
    return reply.code(201).send({ id, token });
  });

  /**
   * PUT /api/settings/tokens/:id
   * Enable/disable a publish token.
   */
  app.put('/tokens/:id', async (request, reply) => {
    const { id } = request.params;
    const { enabled, profile_id } = request.body || {};
    const db = getDb();

    const updates = {};
    if (enabled !== undefined) {
      updates.enabled = enabled ? 1 : 0;
    }
    if (profile_id !== undefined) {
      updates.profile_id = profile_id;
    }

    if (Object.keys(updates).length === 0) {
      return reply.code(400).send({ error: 'No fields to update' });
    }

    const updated = await db('publish_tokens').where('id', id).update(updates);

    if (!updated) {
      return reply.code(404).send({ error: 'Token not found' });
    }
    return { success: true };
  });

  /**
   * DELETE /api/settings/tokens/:id
   * Revoke (delete) a publish token.
   */
  app.delete('/tokens/:id', async (request, reply) => {
    const { id } = request.params;
    const db = getDb();
    const deleted = await db('publish_tokens').where('id', id).delete();
    if (!deleted) {
      return reply.code(404).send({ error: 'Token not found' });
    }
    return { success: true };
  });
}
