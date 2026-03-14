/**
 * Initial schema: all 6 tables for sub-edit-helper.
 */
export function up(knex) {
  return knex.schema
    // providers: proxy subscription sources
    .createTable('providers', (t) => {
      t.increments('id').primary();
      t.string('name').notNullable();
      t.text('url_encrypted').notNullable();       // AES-GCM encrypted subscription URL
      t.integer('sort_order').notNullable().defaultTo(0);
      t.boolean('enabled').notNullable().defaultTo(true);
      t.text('filter').defaultTo('');               // regex filter for nodes
      t.text('check_data').defaultTo('{}');         // JSON: traffic/expiry/node stats
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    // policy_profiles: country / rate / group strategies
    .createTable('policy_profiles', (t) => {
      t.increments('id').primary();
      t.text('country_filter').defaultTo('[]');     // JSON array of country codes
      t.string('rate_regex').defaultTo('');          // multiplier regex filter
      t.text('group_template').defaultTo('{}');     // JSON: proxy-group template config
      t.text('sort_config').defaultTo('{}');        // JSON: group ordering config
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    // rulesets: built-in + user override rules
    .createTable('rulesets', (t) => {
      t.increments('id').primary();
      t.string('builtin_version').defaultTo('1.0.0');
      t.text('user_overrides').defaultTo('');       // YAML text of user edits
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    // publish_tokens: subscription access tokens
    .createTable('publish_tokens', (t) => {
      t.increments('id').primary();
      t.string('token').notNullable().unique();     // UUID v4
      t.boolean('enabled').notNullable().defaultTo(true);
      t.timestamp('last_accessed_at');
      t.timestamp('created_at').defaultTo(knex.fn.now());
    })
    // settings: key-value system settings
    .createTable('settings', (t) => {
      t.string('key').primary();
      t.text('value').defaultTo('');
    })
    // config_versions: compiled config history for rollback
    .createTable('config_versions', (t) => {
      t.increments('id').primary();
      t.text('yaml_text').notNullable();
      t.string('trigger_source').defaultTo('manual'); // manual | auto | rollback
      t.timestamp('created_at').defaultTo(knex.fn.now());
    });
}

export function down(knex) {
  return knex.schema
    .dropTableIfExists('config_versions')
    .dropTableIfExists('settings')
    .dropTableIfExists('publish_tokens')
    .dropTableIfExists('rulesets')
    .dropTableIfExists('policy_profiles')
    .dropTableIfExists('providers');
}
