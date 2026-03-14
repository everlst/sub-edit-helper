import { getDb } from '../db/index.js';
import { compileConfig } from '../services/compiler.js';
import { saveConfigVersion } from '../services/config-version.js';

export async function subscriptionRoutes(app) {
  /**
   * GET /sub/:token
   * Public endpoint: return compiled YAML for Clash/Mihomo clients.
   * Authenticated by the publish token only.
   */
  app.get('/:token', async (request, reply) => {
    const { token } = request.params;
    const db = getDb();

    const row = await db('publish_tokens')
      .where('token', token)
      .where('enabled', 1)
      .first();

    if (!row) {
      return reply.code(403).send({ error: 'Invalid or disabled subscription token' });
    }

    // Update last accessed time
    await db('publish_tokens').where('id', row.id).update({
      last_accessed_at: db.fn.now(),
    });

    try {
      // If token has a profile, load its provider_ids and pass profileId
      let providerIds = null;
      let filename = 'config';
      let profileId = null;
      if (row.profile_id) {
        const profile = await db('profiles').where('id', row.profile_id).first();
        if (profile) {
          providerIds = JSON.parse(profile.provider_ids || '[]');
          filename = profile.filename || 'config';
          profileId = profile.id;
        }
      }

      const yaml = await compileConfig({ providerIds, profileId });

      // Save to version history (auto) with cleanup
      await saveConfigVersion(db, yaml, 'auto');

      reply
        .header('Content-Type', 'text/yaml; charset=utf-8')
        .header('Content-Disposition', `inline; filename="${filename}.yaml"`)
        .header('Profile-Update-Interval', '24')
        .send(yaml);
    } catch (err) {
      reply.code(500).send({ error: 'Failed to compile config: ' + err.message });
    }
  });
}
