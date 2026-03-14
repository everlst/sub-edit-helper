/**
 * Migration 003: Configuration profiles for provider combinations.
 * Each profile defines a subset of providers and a custom output filename.
 * Publish tokens can optionally link to a profile.
 */
export function up(knex) {
  return knex.schema
    .createTable('profiles', (t) => {
      t.increments('id').primary();
      t.string('name').notNullable();
      t.text('provider_ids').notNullable().defaultTo('[]'); // JSON array of provider IDs
      t.string('filename').notNullable().defaultTo('config'); // output filename (without .yaml)
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    .alterTable('publish_tokens', (t) => {
      t.integer('profile_id').nullable().defaultTo(null); // FK to profiles.id, null = all providers
    });
}

export function down(knex) {
  return knex.schema
    .dropTableIfExists('profiles')
    .alterTable('publish_tokens', (t) => {
      t.dropColumn('profile_id');
    });
}
