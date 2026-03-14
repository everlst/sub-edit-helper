import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDatabase } from './db/index.js';
import { ensureEncryptionKey } from './utils/crypto.js';
import { authRoutes } from './routes/auth.js';
import { providerRoutes } from './routes/providers.js';
import { policyRoutes } from './routes/policies.js';
import { ruleRoutes } from './routes/rules.js';
import { configRoutes } from './routes/config.js';
import { subscriptionRoutes } from './routes/subscription.js';
import { proxyRoutes } from './routes/proxy.js';
import { settingsRoutes } from './routes/settings.js';
import { groupRoutes } from './routes/groups.js';
import { profileRoutes } from './routes/profiles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HOST = process.env.HOST || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '3000', 10);

async function start() {
  // Ensure encryption key exists
  ensureEncryptionKey();

  // Initialize database & run migrations
  await initDatabase();

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // Plugins
  await app.register(fastifyCors, {
    origin: true,
    credentials: true,
  });

  await app.register(fastifyCookie);

  // API routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(providerRoutes, { prefix: '/api/providers' });
  await app.register(policyRoutes, { prefix: '/api/policies' });
  await app.register(ruleRoutes, { prefix: '/api/rules' });
  await app.register(configRoutes, { prefix: '/api/config' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  await app.register(groupRoutes, { prefix: '/api/groups' });
  await app.register(profileRoutes, { prefix: '/api/profiles' });
  await app.register(proxyRoutes, { prefix: '/api/proxy' });
  await app.register(subscriptionRoutes, { prefix: '/sub' });

  // Serve Vue frontend static files in production
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  await app.register(fastifyStatic, {
    root: clientDist,
    prefix: '/',
    wildcard: false,
  });

  // SPA fallback: serve index.html for unmatched routes
  app.setNotFoundHandler((_req, reply) => {
    reply.sendFile('index.html');
  });

  // Start
  await app.listen({ host: HOST, port: PORT });
  app.log.info(`Server running at http://${HOST}:${PORT}`);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
