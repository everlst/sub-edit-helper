import knex from 'knex';
import knexConfig from '../../knexfile.js';
import fs from 'node:fs';
import path from 'node:path';

let db;

/**
 * Initialize database: ensure data directory exists and run migrations.
 */
export async function initDatabase() {
  const dataDir = path.dirname(knexConfig.connection.filename);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = knex(knexConfig);
  await db.migrate.latest();
  return db;
}

/**
 * Get the knex database instance.
 */
export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}
