import { getDb } from '../db/index.js';
import { encrypt, decrypt, maskUrl } from '../utils/crypto.js';
import { requireAuth } from '../middleware/auth.js';
import { parseSubscriptionInfo, fetchAndParseNodes } from '../services/subscription.js';

export async function providerRoutes(app) {
  // All provider routes require admin auth
  app.addHook('onRequest', requireAuth);

  /**
   * GET /api/providers
   * List all providers (URL is masked).
   */
  app.get('/', async () => {
    const db = getDb();
    const rows = await db('providers').orderBy('sort_order', 'asc');

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      url_masked: maskUrl(decrypt(row.url_encrypted)),
      sort_order: row.sort_order,
      enabled: !!row.enabled,
      filter: row.filter,
      show_sub_info: !!row.show_sub_info,
      sub_info_filter: row.sub_info_filter || 'Traffic|Expire',
      sub_info_prefix: row.sub_info_prefix || '',
      check_data: JSON.parse(row.check_data || '{}'),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  });

  /**
   * POST /api/providers
   * Create a new provider.
   */
  app.post('/', async (request, reply) => {
    const { name, url, filter, show_sub_info, sub_info_filter, sub_info_prefix } = request.body || {};
    if (!name || !url) {
      return reply.code(400).send({ error: 'name and url are required' });
    }

    const db = getDb();

    // Get next sort_order
    const last = await db('providers').max('sort_order as max').first();
    const sortOrder = (last?.max ?? -1) + 1;

    const [id] = await db('providers').insert({
      name,
      url_encrypted: encrypt(url),
      sort_order: sortOrder,
      enabled: true,
      filter: filter || '',
      show_sub_info: show_sub_info ? 1 : 0,
      sub_info_filter: sub_info_filter || 'Traffic|Expire',
      sub_info_prefix: sub_info_prefix || '',
      check_data: '{}',
    });

    return reply.code(201).send({ id, name, sort_order: sortOrder });
  });

  /**
   * PUT /api/providers/:id
   * Update an existing provider.
   */
  app.put('/:id', async (request, reply) => {
    const { id } = request.params;
    const { name, url, enabled, filter, show_sub_info, sub_info_filter, sub_info_prefix } = request.body || {};

    const db = getDb();
    const existing = await db('providers').where('id', id).first();
    if (!existing) {
      return reply.code(404).send({ error: 'Provider not found' });
    }

    const updates = { updated_at: db.fn.now() };
    if (name !== undefined) updates.name = name;
    if (url !== undefined) updates.url_encrypted = encrypt(url);
    if (enabled !== undefined) updates.enabled = enabled ? 1 : 0;
    if (filter !== undefined) updates.filter = filter;
    if (show_sub_info !== undefined) updates.show_sub_info = show_sub_info ? 1 : 0;
    if (sub_info_filter !== undefined) updates.sub_info_filter = sub_info_filter;
    if (sub_info_prefix !== undefined) updates.sub_info_prefix = sub_info_prefix;

    await db('providers').where('id', id).update(updates);
    return { success: true };
  });

  /**
   * DELETE /api/providers/:id
   */
  app.delete('/:id', async (request, reply) => {
    const { id } = request.params;
    const db = getDb();
    const deleted = await db('providers').where('id', id).delete();
    if (!deleted) {
      return reply.code(404).send({ error: 'Provider not found' });
    }
    return { success: true };
  });

  /**
   * POST /api/providers/reorder
   * Save provider drag-drop order.
   * Body: { order: [id1, id2, id3, ...] }
   */
  app.post('/reorder', async (request, reply) => {
    const { order } = request.body || {};
    if (!Array.isArray(order)) {
      return reply.code(400).send({ error: 'order must be an array of provider ids' });
    }

    const db = getDb();
    const trx = await db.transaction();

    try {
      for (let i = 0; i < order.length; i++) {
        await trx('providers').where('id', order[i]).update({ sort_order: i });
      }
      await trx.commit();
    } catch (err) {
      await trx.rollback();
      throw err;
    }

    return { success: true };
  });

  /**
   * POST /api/providers/:id/check
   * On-demand: fetch subscription info and node statistics.
   */
  app.post('/:id/check', async (request, reply) => {
    const { id } = request.params;
    const db = getDb();
    const provider = await db('providers').where('id', id).first();

    if (!provider) {
      return reply.code(404).send({ error: 'Provider not found' });
    }

    const url = decrypt(provider.url_encrypted);

    try {
      // Fetch subscription userinfo from headers
      const subInfo = await parseSubscriptionInfo(url);

      // Fetch and parse nodes for statistics
      const nodeStats = await fetchAndParseNodes(url, provider.filter);

      const checkData = {
        ...subInfo,
        ...nodeStats,
        checked_at: new Date().toISOString(),
      };

      await db('providers').where('id', id).update({
        check_data: JSON.stringify(checkData),
        updated_at: db.fn.now(),
      });

      return checkData;
    } catch (err) {
      const errorData = {
        error: err.message,
        checked_at: new Date().toISOString(),
      };

      await db('providers').where('id', id).update({
        check_data: JSON.stringify(errorData),
        updated_at: db.fn.now(),
      });

      return reply.code(502).send(errorData);
    }
  });
}
