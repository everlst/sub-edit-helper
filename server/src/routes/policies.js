import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

export async function policyRoutes(app) {
  app.addHook('onRequest', requireAuth);

  /**
   * GET /api/policies
   * Get current policy profile (singleton, id=1).
   */
  app.get('/', async () => {
    const db = getDb();
    let row = await db('policy_profiles').where('id', 1).first();

    if (!row) {
      // Create default policy profile
      await db('policy_profiles').insert({
        id: 1,
        country_filter: '[]',
        rate_regex: '',
        group_template: JSON.stringify({
          default_groups: ['🚀 节点选择', '⚡ 自动选择'],
          auto_country_groups: true,
          auto_provider_groups: true,
        }),
        sort_config: JSON.stringify({
          group_order: ['🚀 节点选择', '⚡ 自动选择'],
        }),
      });
      row = await db('policy_profiles').where('id', 1).first();
    }

    return {
      country_filter: JSON.parse(row.country_filter || '[]'),
      rate_regex: row.rate_regex || '',
      group_template: JSON.parse(row.group_template || '{}'),
      sort_config: JSON.parse(row.sort_config || '{}'),
      updated_at: row.updated_at,
    };
  });

  /**
   * PUT /api/policies
   * Update policy profile.
   */
  app.put('/', async (request) => {
    const { country_filter, rate_regex, group_template, sort_config } = request.body || {};
    const db = getDb();

    const updates = { updated_at: db.fn.now() };
    if (country_filter !== undefined) updates.country_filter = JSON.stringify(country_filter);
    if (rate_regex !== undefined) updates.rate_regex = rate_regex;
    if (group_template !== undefined) updates.group_template = JSON.stringify(group_template);
    if (sort_config !== undefined) updates.sort_config = JSON.stringify(sort_config);

    await db('policy_profiles').where('id', 1).update(updates);
    return { success: true };
  });
}
