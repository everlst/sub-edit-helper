import { getDb } from '../db/index.js';
import { decrypt } from '../utils/crypto.js';
import { httpRequest } from '../utils/http.js';

export async function proxyRoutes(app) {
  /**
   * GET /api/proxy/:providerId/:token
   * Proxy-forward subscription request to the real provider URL.
   * This prevents exposing the original subscription URL in client configs.
   * Authenticated by publish token.
   */
  app.get('/:providerId/:token', async (request, reply) => {
    const { providerId, token } = request.params;
    const db = getDb();

    // Validate publish token
    const tokenRow = await db('publish_tokens')
      .where('token', token)
      .where('enabled', 1)
      .first();

    if (!tokenRow) {
      return reply.code(403).send({ error: 'Invalid subscription token' });
    }

    // Get provider
    const provider = await db('providers').where('id', providerId).first();
    if (!provider || !provider.enabled) {
      return reply.code(404).send({ error: 'Provider not found or disabled' });
    }

    const url = decrypt(provider.url_encrypted);

    try {
      const { statusCode, headers, body } = await httpRequest(url, {
        method: 'GET',
        headers: {
          'User-Agent': request.headers['user-agent'] || 'ClashMeta/1.0',
        },
        signal: AbortSignal.timeout(30000),
      });

      // Forward relevant headers
      const forwardHeaders = [
        'content-type',
        'subscription-userinfo',
        'profile-update-interval',
        'content-disposition',
      ];

      for (const h of forwardHeaders) {
        if (headers[h]) {
          reply.header(h, headers[h]);
        }
      }

      reply.code(statusCode);
      return reply.send(body);
    } catch (err) {
      return reply.code(502).send({
        error: `Failed to fetch from provider: ${err.message}`,
      });
    }
  });
}
