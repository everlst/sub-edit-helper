import knex from 'knex';
import knexConfig from '../../../knexfile.js';

const action = process.argv[2];

async function run() {
  const db = knex(knexConfig);

  try {
    if (action === 'rollback') {
      const [batchNo, log] = await db.migrate.rollback();
      console.log(`Rolled back batch ${batchNo}: ${log.length} migrations`);
      log.forEach((f) => console.log(`  ↩ ${f}`));
    } else {
      const [batchNo, log] = await db.migrate.latest();
      console.log(`Migrated batch ${batchNo}: ${log.length} migrations`);
      log.forEach((f) => console.log(`  ✓ ${f}`));
    }
  } finally {
    await db.destroy();
  }
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
