import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load the built-in base rules from base-rules.yaml.
 */
function loadBuiltinRules() {
  const rulesPath = path.join(__dirname, '..', '..', '..', 'base-rules.yaml');
  if (fs.existsSync(rulesPath)) {
    return fs.readFileSync(rulesPath, 'utf-8');
  }
  return '';
}

export async function ruleRoutes(app) {
  app.addHook('onRequest', requireAuth);

  /**
   * GET /api/rules?profile_id=N
   * Return builtin rules + user overrides for a specific profile.
   */
  app.get('/', async (request) => {
    const { profile_id } = request.query;
    const db = getDb();

    let row;
    if (profile_id) {
      row = await db('rulesets').where('profile_id', profile_id).first();
    } else {
      row = await db('rulesets').where('id', 1).first();
    }

    if (!row) {
      const builtinRules = loadBuiltinRules();
      // Auto-create a ruleset entry for this profile
      if (profile_id) {
        await db('rulesets').insert({
          builtin_version: '1.0.0',
          user_overrides: '',
          profile_id: profile_id,
        });
      }
      return {
        builtin: builtinRules,
        user_overrides: '',
        builtin_version: '1.0.0',
        updated_at: null,
      };
    }

    return {
      builtin: loadBuiltinRules(),
      user_overrides: row.user_overrides || '',
      builtin_version: row.builtin_version,
      updated_at: row.updated_at,
    };
  });

  /**
   * PUT /api/rules
   * Update user override rules (YAML text) for a profile.
   * Body: { user_overrides, profile_id }
   */
  app.put('/', async (request) => {
    const { user_overrides, profile_id } = request.body || {};
    const db = getDb();

    if (profile_id) {
      const existing = await db('rulesets').where('profile_id', profile_id).first();
      if (existing) {
        await db('rulesets').where('profile_id', profile_id).update({
          user_overrides: user_overrides ?? '',
          updated_at: db.fn.now(),
        });
      } else {
        await db('rulesets').insert({
          builtin_version: '1.0.0',
          user_overrides: user_overrides ?? '',
          profile_id: profile_id,
        });
      }
    } else {
      // Legacy fallback: update id=1
      await db('rulesets').where('id', 1).update({
        user_overrides: user_overrides ?? '',
        updated_at: db.fn.now(),
      });
    }

    return { success: true };
  });
}
