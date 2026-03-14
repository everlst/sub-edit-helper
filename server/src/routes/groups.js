import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import yaml from 'js-yaml';

export async function groupRoutes(app) {
  app.addHook('onRequest', requireAuth);

  /**
   * GET /api/groups?profile_id=N
   * List proxy groups for a profile, ordered by sort_order.
   */
  app.get('/', async (request) => {
    const { profile_id } = request.query;
    const db = getDb();
    let query = db('proxy_groups').orderBy('sort_order', 'asc');
    if (profile_id) {
      query = query.where('profile_id', profile_id);
    }
    const rows = await query;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      sort_order: row.sort_order,
      hidden: !!row.hidden,
      test_url: row.test_url || '',
      interval: row.interval,
      timeout: row.timeout,
      tolerance: row.tolerance,
      filter: row.filter || '',
      proxies: JSON.parse(row.proxies || '[]'),
      use_providers: JSON.parse(row.use_providers || '[]'),
      use_sub_info_providers: JSON.parse(row.use_sub_info_providers || '[]'),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  });

  /**
   * POST /api/groups
   * Create a new proxy group.
   */
  app.post('/', async (request, reply) => {
    const {
      name, type, hidden, test_url, interval, timeout, tolerance,
      filter, proxies, use_providers, use_sub_info_providers, profile_id,
    } = request.body || {};

    if (!name || !type) {
      return reply.code(400).send({ error: 'name and type are required' });
    }

    const validTypes = ['select', 'url-test', 'fallback', 'load-balance'];
    if (!validTypes.includes(type)) {
      return reply.code(400).send({ error: `type must be one of: ${validTypes.join(', ')}` });
    }

    const db = getDb();

    // Get next sort_order (scoped to profile)
    let lastQuery = db('proxy_groups').max('sort_order as max');
    if (profile_id) lastQuery = lastQuery.where('profile_id', profile_id);
    const last = await lastQuery.first();
    const sortOrder = (last?.max ?? -1) + 1;

    const [id] = await db('proxy_groups').insert({
      name,
      type,
      sort_order: sortOrder,
      hidden: hidden ? 1 : 0,
      test_url: test_url || '',
      interval: interval ?? 300,
      timeout: timeout ?? 5000,
      tolerance: tolerance ?? 50,
      filter: filter || '',
      proxies: JSON.stringify(proxies || []),
      use_providers: JSON.stringify(use_providers || []),
      use_sub_info_providers: JSON.stringify(use_sub_info_providers || []),
      profile_id: profile_id || null,
    });

    return reply.code(201).send({ id, name, type, sort_order: sortOrder });
  });

  /**
   * PUT /api/groups/:id
   * Update an existing proxy group.
   */
  app.put('/:id', async (request, reply) => {
    const { id } = request.params;
    const {
      name, type, hidden, test_url, interval, timeout, tolerance,
      filter, proxies, use_providers, use_sub_info_providers,
    } = request.body || {};

    const db = getDb();
    const existing = await db('proxy_groups').where('id', id).first();
    if (!existing) {
      return reply.code(404).send({ error: 'Group not found' });
    }

    if (type) {
      const validTypes = ['select', 'url-test', 'fallback', 'load-balance'];
      if (!validTypes.includes(type)) {
        return reply.code(400).send({ error: `type must be one of: ${validTypes.join(', ')}` });
      }
    }

    const updates = { updated_at: db.fn.now() };
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (hidden !== undefined) updates.hidden = hidden ? 1 : 0;
    if (test_url !== undefined) updates.test_url = test_url;
    if (interval !== undefined) updates.interval = interval;
    if (timeout !== undefined) updates.timeout = timeout;
    if (tolerance !== undefined) updates.tolerance = tolerance;
    if (filter !== undefined) updates.filter = filter;
    if (proxies !== undefined) updates.proxies = JSON.stringify(proxies);
    if (use_providers !== undefined) updates.use_providers = JSON.stringify(use_providers);
    if (use_sub_info_providers !== undefined) updates.use_sub_info_providers = JSON.stringify(use_sub_info_providers);

    await db('proxy_groups').where('id', id).update(updates);
    return { success: true };
  });

  /**
   * DELETE /api/groups/:id
   */
  app.delete('/:id', async (request, reply) => {
    const { id } = request.params;
    const db = getDb();
    const deleted = await db('proxy_groups').where('id', id).delete();
    if (!deleted) {
      return reply.code(404).send({ error: 'Group not found' });
    }
    return { success: true };
  });

  /**
   * POST /api/groups/reorder
   * Save group drag-drop order.
   * Body: { order: [id1, id2, id3, ...] }
   */
  app.post('/reorder', async (request, reply) => {
    const { order } = request.body || {};
    if (!Array.isArray(order)) {
      return reply.code(400).send({ error: 'order must be an array of group ids' });
    }

    const db = getDb();
    const trx = await db.transaction();

    try {
      for (let i = 0; i < order.length; i++) {
        await trx('proxy_groups').where('id', order[i]).update({ sort_order: i });
      }
      await trx.commit();
    } catch (err) {
      await trx.rollback();
      throw err;
    }

    return { success: true };
  });

  /**
   * POST /api/groups/import
   * Import proxy-groups from YAML text.
   * Parses the YAML, maps `use` entries to existing providers by name,
   * and creates group records. Returns import summary.
   *
   * Body: { yaml_text: string, replace_existing?: boolean }
   */
  app.post('/import', async (request, reply) => {
    const { yaml_text, replace_existing, profile_id } = request.body || {};

    if (!yaml_text?.trim()) {
      return reply.code(400).send({ error: 'yaml_text is required' });
    }

    let parsed;
    try {
      parsed = yaml.load(yaml_text);
    } catch (err) {
      return reply.code(400).send({ error: `YAML parse error: ${err.message}` });
    }

    // Support both { proxy-groups: [...] } and raw array
    let groups = parsed;
    if (parsed && parsed['proxy-groups']) {
      groups = parsed['proxy-groups'];
    }

    if (!Array.isArray(groups)) {
      return reply.code(400).send({ error: 'Expected an array of proxy-groups or a YAML object with proxy-groups key' });
    }

    const db = getDb();

    // Load existing providers for name -> id mapping
    const providers = await db('providers').select('id', 'name');
    const providerNameMap = {};
    for (const p of providers) {
      providerNameMap[p.name] = p.id;
      // Also map provider-{id} format
      providerNameMap[`provider-${p.id}`] = p.id;
    }

    // Load existing group names for deduplication (scoped to profile)
    let existingQuery = db('proxy_groups').select('id', 'name');
    if (profile_id) existingQuery = existingQuery.where('profile_id', profile_id);
    const existingGroups = await existingQuery;
    const existingGroupMap = {};
    for (const g of existingGroups) {
      existingGroupMap[g.name] = g.id;
    }

    // Get max sort_order (scoped to profile)
    let lastQuery = db('proxy_groups').max('sort_order as max');
    if (profile_id) lastQuery = lastQuery.where('profile_id', profile_id);
    const last = await lastQuery.first();
    let nextOrder = (last?.max ?? -1) + 1;

    const results = { imported: 0, updated: 0, skipped: 0, errors: [] };

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];

      if (!g.name || !g.type) {
        results.errors.push(`[${i}] Missing name or type`);
        results.skipped++;
        continue;
      }

      const validTypes = ['select', 'url-test', 'fallback', 'load-balance'];
      if (!validTypes.includes(g.type)) {
        results.errors.push(`[${i}] "${g.name}": invalid type "${g.type}"`);
        results.skipped++;
        continue;
      }

      // Map `use` (provider names) to provider IDs
      const useProviderIds = [];
      const unmappedProviders = [];
      if (Array.isArray(g.use)) {
        for (const provName of g.use) {
          if (providerNameMap[provName] !== undefined) {
            useProviderIds.push(providerNameMap[provName]);
          } else {
            unmappedProviders.push(provName);
          }
        }
      }

      if (unmappedProviders.length > 0) {
        results.errors.push(`[${i}] "${g.name}": unmatched providers: ${unmappedProviders.join(', ')}`);
      }

      // proxies stays as-is (group name references)
      const proxies = Array.isArray(g.proxies) ? g.proxies : [];

      const record = {
        name: g.name,
        type: g.type,
        hidden: g.hidden ? 1 : 0,
        test_url: g.url || '',
        interval: g.interval ?? 300,
        timeout: g.timeout ?? 5000,
        tolerance: g.tolerance ?? 50,
        filter: g.filter || '',
        proxies: JSON.stringify(proxies),
        use_providers: JSON.stringify(useProviderIds),
        use_sub_info_providers: '[]',
        profile_id: profile_id || null,
      };

      try {
        if (existingGroupMap[g.name] !== undefined) {
          if (replace_existing) {
            await db('proxy_groups')
              .where('id', existingGroupMap[g.name])
              .update({ ...record, updated_at: db.fn.now() });
            results.updated++;
          } else {
            results.errors.push(`[${i}] "${g.name}": already exists (skipped)`);
            results.skipped++;
          }
        } else {
          record.sort_order = nextOrder++;
          await db('proxy_groups').insert(record);
          results.imported++;
        }
      } catch (err) {
        results.errors.push(`[${i}] "${g.name}": ${err.message}`);
        results.skipped++;
      }
    }

    return results;
  });

  /**
   * POST /api/groups/batch
   * Batch-create groups from a region template.
   * Body: { provider_id, regions: [{ name, emoji, filter }], create_auto: boolean }
   *
   * For each region, creates:
   *   1. A hidden url-test group "{emoji} {providerName}-{regionName}-自动"
   *   2. A select group "{emoji} {providerName}-{regionName}" with the auto group + provider nodes
   */
  app.post('/batch', async (request, reply) => {
    const { provider_id, regions, create_auto, profile_id } = request.body || {};

    if (!provider_id || !Array.isArray(regions) || regions.length === 0) {
      return reply.code(400).send({ error: 'provider_id and regions[] are required' });
    }

    const db = getDb();
    const provider = await db('providers').where('id', provider_id).first();
    if (!provider) {
      return reply.code(404).send({ error: 'Provider not found' });
    }

    let lastQuery = db('proxy_groups').max('sort_order as max');
    if (profile_id) lastQuery = lastQuery.where('profile_id', profile_id);
    const last = await lastQuery.first();
    let nextOrder = (last?.max ?? -1) + 1;

    const created = [];

    for (const region of regions) {
      const { name: regionName, emoji, filter: regionFilter, sub_filters } = region;
      if (!regionName) continue;

      const prefix = emoji ? `${emoji} ` : '';

      // If sub_filters provided (e.g. ["实验性", "标准和高级"]), create per-sub-filter groups
      const filterList = Array.isArray(sub_filters) && sub_filters.length > 0
        ? sub_filters
        : [null]; // null = no sub-filter, just region

      for (const subFilter of filterList) {
        const suffix = subFilter ? `-${subFilter}` : '';
        const combinedFilter = subFilter
          ? `${regionFilter || regionName}.*${subFilter}`
          : (regionFilter || regionName);

        if (create_auto !== false) {
          // Create hidden url-test auto group
          const autoName = `${prefix}${provider.name}-${regionName}${suffix}-自动`;
          const autoId = await db('proxy_groups').insert({
            name: autoName,
            type: 'url-test',
            sort_order: nextOrder++,
            hidden: 1,
            test_url: 'http://www.gstatic.com/generate_204',
            interval: 300,
            timeout: 5000,
            tolerance: 50,
            filter: combinedFilter,
            proxies: '[]',
            use_providers: JSON.stringify([provider_id]),
            use_sub_info_providers: '[]',
            profile_id: profile_id || null,
          });
          created.push(autoName);

          // Create select group referencing the auto group
          const selectName = `${prefix}${provider.name}-${regionName}${suffix}`;
          await db('proxy_groups').insert({
            name: selectName,
            type: 'select',
            sort_order: nextOrder++,
            hidden: 0,
            test_url: '',
            interval: 300,
            timeout: 5000,
            tolerance: 50,
            filter: combinedFilter,
            proxies: JSON.stringify([autoName]),
            use_providers: JSON.stringify([provider_id]),
            use_sub_info_providers: '[]',
            profile_id: profile_id || null,
          });
          created.push(selectName);
        } else {
          // Just create a select group
          const selectName = `${prefix}${provider.name}-${regionName}${suffix}`;
          await db('proxy_groups').insert({
            name: selectName,
            type: 'select',
            sort_order: nextOrder++,
            hidden: 0,
            test_url: '',
            interval: 300,
            timeout: 5000,
            tolerance: 50,
            filter: combinedFilter,
            proxies: '[]',
            use_providers: JSON.stringify([provider_id]),
            use_sub_info_providers: '[]',
            profile_id: profile_id || null,
          });
          created.push(selectName);
        }
      }
    }

    return { success: true, created };
  });
}
