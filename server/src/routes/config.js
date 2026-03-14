import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { compileConfig } from '../services/compiler.js';
import { saveConfigVersion } from '../services/config-version.js';

export async function configRoutes(app) {
  /**
   * POST /api/config/preview
   * Return compiled YAML text preview. Requires admin auth.
   * Body: { profile_id? }
   */
  app.post('/preview', { onRequest: requireAuth }, async (request) => {
    const { profile_id } = request.body || {};
    let providerIds = null;
    let profileId = null;

    if (profile_id) {
      const db = getDb();
      const profile = await db('profiles').where('id', profile_id).first();
      if (profile) {
        providerIds = JSON.parse(profile.provider_ids || '[]');
        profileId = profile.id;
      }
    }

    const yaml = await compileConfig({ providerIds, profileId });
    return { yaml };
  });

  /**
   * GET /api/config/download?profile_id=N
   * Download compiled YAML. Requires admin auth.
   */
  app.get('/download', { onRequest: requireAuth }, async (request, reply) => {
    const { profile_id } = request.query;
    const db = getDb();
    let providerIds = null;
    let profileId = null;
    let filename = 'config';

    if (profile_id) {
      const profile = await db('profiles').where('id', profile_id).first();
      if (profile) {
        providerIds = JSON.parse(profile.provider_ids || '[]');
        profileId = profile.id;
        filename = profile.filename || 'config';
      }
    }

    const yaml = await compileConfig({ providerIds, profileId });

    // Save to version history
    await saveConfigVersion(db, yaml, 'manual');

    reply
      .header('Content-Type', 'application/x-yaml; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}.yaml"`)
      .send(yaml);
  });

  /**
   * GET /api/config/versions
   * List recent config versions. Requires admin auth.
   */
  app.get('/versions', { onRequest: requireAuth }, async () => {
    const db = getDb();
    const versions = await db('config_versions')
      .select('id', 'trigger_source', 'created_at')
      .orderBy('created_at', 'desc')
      .limit(15);
    return versions;
  });

  /**
   * POST /api/config/rollback/:versionId
   * Rollback to a specific config version. Requires admin auth.
   */
  app.post('/rollback/:versionId', { onRequest: requireAuth }, async (request, reply) => {
    const { versionId } = request.params;
    const db = getDb();
    const version = await db('config_versions').where('id', versionId).first();

    if (!version) {
      return reply.code(404).send({ error: 'Config version not found' });
    }

    // Save the rollback as a new version
    await saveConfigVersion(db, version.yaml_text, 'rollback');

    return { success: true, yaml: version.yaml_text };
  });
}
