/**
 * Migration 002: Custom proxy groups + provider subscription info display.
 */
export function up(knex) {
  return knex.schema
    // proxy_groups: user-defined strategy groups
    .createTable('proxy_groups', (t) => {
      t.increments('id').primary();
      t.string('name').notNullable();                // group name (with emoji), e.g. "🚀 节点选择"
      t.string('type').notNullable().defaultTo('select'); // select | url-test | fallback | load-balance
      t.integer('sort_order').notNullable().defaultTo(0);
      t.boolean('hidden').notNullable().defaultTo(false);
      t.string('test_url').defaultTo('');             // health check URL for url-test/fallback
      t.integer('interval').defaultTo(300);           // health check interval (seconds)
      t.integer('timeout').defaultTo(5000);           // health check timeout (ms)
      t.integer('tolerance').defaultTo(50);           // url-test tolerance (ms)
      t.text('filter').defaultTo('');                 // regex filter applied to provider nodes
      t.text('proxies').defaultTo('[]');              // JSON array: referenced group names or built-in (DIRECT, REJECT)
      t.text('use_providers').defaultTo('[]');        // JSON array: provider IDs to include via `use`
      t.text('use_sub_info_providers').defaultTo('[]'); // JSON array: subscription-info provider IDs for `use`
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    // Add subscription info display columns to providers
    .alterTable('providers', (t) => {
      t.boolean('show_sub_info').notNullable().defaultTo(false);
      t.text('sub_info_filter').defaultTo('Traffic|Expire');
      t.text('sub_info_prefix').defaultTo('');        // e.g. "[机场名] ", empty = auto "[{name}] "
    });
}

export function down(knex) {
  return knex.schema
    .dropTableIfExists('proxy_groups')
    .alterTable('providers', (t) => {
      t.dropColumn('show_sub_info');
      t.dropColumn('sub_info_filter');
      t.dropColumn('sub_info_prefix');
    });
}
