import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

export async function profileRoutes(app) {
  // All profile routes require admin auth
  app.addHook('onRequest', requireAuth);

  /**
   * GET /api/profiles
   * List all profiles with provider_ids parsed as arrays.
   */
  app.get('/', async () => {
    const db = getDb();
    const rows = await db('profiles').orderBy('created_at', 'asc');
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      provider_ids: JSON.parse(row.provider_ids || '[]'),
      filename: row.filename || 'config',
      is_default: !!row.is_default,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  });

  /**
   * POST /api/profiles
   * Create a new profile.
   * Optional: copy_from (profile ID) to duplicate groups + rules from an existing profile.
   */
  app.post('/', async (request, reply) => {
    const { name, provider_ids, filename, copy_from } = request.body || {};
    if (!name?.trim()) {
      return reply.code(400).send({ error: 'name is required' });
    }
    if (!Array.isArray(provider_ids) || provider_ids.length === 0) {
      return reply.code(400).send({ error: 'provider_ids must be a non-empty array' });
    }

    const sanitizedFilename = sanitizeFilename(filename);
    const db = getDb();

    // Check if this is the first profile → make it default
    const existingCount = await db('profiles').count('id as cnt').first();
    const isFirst = (existingCount?.cnt ?? 0) === 0;

    const [id] = await db('profiles').insert({
      name: name.trim(),
      provider_ids: JSON.stringify(provider_ids),
      filename: sanitizedFilename,
      is_default: isFirst ? true : false,
    });

    // Copy groups + rules from source profile if copy_from is specified
    if (copy_from) {
      const sourceProfile = await db('profiles').where('id', copy_from).first();
      if (sourceProfile) {
        // Copy proxy_groups
        const sourceGroups = await db('proxy_groups').where('profile_id', copy_from).orderBy('sort_order', 'asc');
        for (const g of sourceGroups) {
          await db('proxy_groups').insert({
            name: g.name,
            type: g.type,
            sort_order: g.sort_order,
            hidden: g.hidden,
            test_url: g.test_url,
            interval: g.interval,
            timeout: g.timeout,
            tolerance: g.tolerance,
            filter: g.filter,
            proxies: g.proxies,
            use_providers: g.use_providers,
            use_sub_info_providers: g.use_sub_info_providers,
            profile_id: id,
          });
        }

        // Copy rulesets
        const sourceRules = await db('rulesets').where('profile_id', copy_from);
        for (const r of sourceRules) {
          await db('rulesets').insert({
            builtin_version: r.builtin_version,
            user_overrides: r.user_overrides,
            profile_id: id,
          });
        }
      }
    }

    return reply.code(201).send({ id, name: name.trim(), is_default: isFirst });
  });

  /**
   * PUT /api/profiles/:id
   * Update an existing profile.
   */
  app.put('/:id', async (request, reply) => {
    const { id } = request.params;
    const { name, provider_ids, filename } = request.body || {};

    const db = getDb();
    const existing = await db('profiles').where('id', id).first();
    if (!existing) {
      return reply.code(404).send({ error: 'Profile not found' });
    }

    const updates = { updated_at: db.fn.now() };
    if (name !== undefined) updates.name = name.trim();
    if (provider_ids !== undefined) updates.provider_ids = JSON.stringify(provider_ids);
    if (filename !== undefined) updates.filename = sanitizeFilename(filename);

    await db('profiles').where('id', id).update(updates);
    return { success: true };
  });

  /**
   * PUT /api/profiles/:id/default
   * Set a profile as the default. Clears default flag from all other profiles.
   */
  app.put('/:id/default', async (request, reply) => {
    const { id } = request.params;
    const db = getDb();

    const existing = await db('profiles').where('id', id).first();
    if (!existing) {
      return reply.code(404).send({ error: 'Profile not found' });
    }

    // Clear all defaults, then set this one
    await db('profiles').update({ is_default: false });
    await db('profiles').where('id', id).update({ is_default: true });

    return { success: true };
  });

  /**
   * DELETE /api/profiles/:id
   * Delete a profile with cascade:
   *   - Delete associated proxy_groups
   *   - Delete associated rulesets
   *   - Delete associated publish_tokens
   */
  app.delete('/:id', async (request, reply) => {
    const { id } = request.params;
    const db = getDb();

    const existing = await db('profiles').where('id', id).first();
    if (!existing) {
      return reply.code(404).send({ error: 'Profile not found' });
    }

    // Cascade delete associated data
    await db('proxy_groups').where('profile_id', id).delete();
    await db('rulesets').where('profile_id', id).delete();
    await db('publish_tokens').where('profile_id', id).delete();

    // Delete the profile itself
    await db('profiles').where('id', id).delete();

    // If the deleted profile was default, promote the first remaining profile
    if (existing.is_default) {
      const next = await db('profiles').orderBy('created_at', 'asc').first();
      if (next) {
        await db('profiles').where('id', next.id).update({ is_default: true });
      }
    }

    return { success: true };
  });
}

/**
 * Sanitize filename: allow letters, numbers, hyphens, underscores, Chinese chars.
 */
function sanitizeFilename(filename) {
  if (!filename) return 'config';
  const sanitized = filename.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, '');
  return sanitized || 'config';
}
