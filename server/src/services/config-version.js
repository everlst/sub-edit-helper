import { getDb } from '../db/index.js';

const MAX_VERSIONS = 15;

/**
 * Save a compiled config to version history, keeping max MAX_VERSIONS entries.
 * @param {import('knex').Knex} db - knex instance
 * @param {string} yamlText - compiled YAML content
 * @param {string} triggerSource - 'manual' | 'auto' | 'rollback'
 */
export async function saveConfigVersion(db, yamlText, triggerSource) {
  await db('config_versions').insert({
    yaml_text: yamlText,
    trigger_source: triggerSource,
  });

  // Prune old versions beyond MAX_VERSIONS
  const count = await db('config_versions').count('id as count').first();
  if (count.count > MAX_VERSIONS) {
    const cutoff = await db('config_versions')
      .select('id')
      .orderBy('created_at', 'desc')
      .offset(MAX_VERSIONS)
      .limit(1)
      .first();

    if (cutoff) {
      await db('config_versions').where('id', '<=', cutoff.id).delete();
    }
  }
}
