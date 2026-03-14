/**
 * Migration 004: Profile-scoped groups and rules.
 *
 * - Adds profile_id to proxy_groups (each profile owns its own groups)
 * - Adds profile_id to rulesets (each profile owns its own rule overrides)
 * - Adds is_default to profiles
 *
 * Data migration:
 *   If proxy_groups or rulesets already exist and no profiles exist yet,
 *   auto-create a "默认配置" profile that inherits all existing data.
 */
export async function up(knex) {
  // 1. Add is_default column to profiles
  await knex.schema.alterTable('profiles', (t) => {
    t.boolean('is_default').notNullable().defaultTo(false);
  });

  // 2. Add profile_id to proxy_groups
  await knex.schema.alterTable('proxy_groups', (t) => {
    t.integer('profile_id').nullable();
  });

  // 3. Add profile_id to rulesets
  await knex.schema.alterTable('rulesets', (t) => {
    t.integer('profile_id').nullable();
  });

  // 4. Data migration: auto-create default profile if needed
  const existingProfiles = await knex('profiles').select('id');
  const existingGroups = await knex('proxy_groups').select('id').limit(1);
  const existingRules = await knex('rulesets').select('id').limit(1);

  const hasData = existingGroups.length > 0 || existingRules.length > 0;

  if (hasData && existingProfiles.length === 0) {
    // Gather all enabled provider IDs
    const enabledProviders = await knex('providers').where('enabled', 1).select('id');
    const providerIds = enabledProviders.map((p) => p.id);

    // Create the default profile
    const [profileId] = await knex('profiles').insert({
      name: '默认配置',
      provider_ids: JSON.stringify(providerIds),
      filename: 'config',
      is_default: true,
    });

    // Assign existing proxy_groups to this profile
    await knex('proxy_groups').whereNull('profile_id').update({ profile_id: profileId });

    // Assign existing rulesets to this profile
    await knex('rulesets').whereNull('profile_id').update({ profile_id: profileId });

    // Assign orphan tokens (profile_id = null) to this profile
    await knex('publish_tokens').whereNull('profile_id').update({ profile_id: profileId });
  } else if (existingProfiles.length > 0 && hasData) {
    // Profiles exist but groups/rules have no profile_id yet — assign to first profile
    const firstProfile = await knex('profiles').orderBy('created_at', 'asc').first();
    if (firstProfile) {
      await knex('proxy_groups').whereNull('profile_id').update({ profile_id: firstProfile.id });
      await knex('rulesets').whereNull('profile_id').update({ profile_id: firstProfile.id });

      // Set the first profile as default if none is default
      const hasDefault = await knex('profiles').where('is_default', true).first();
      if (!hasDefault) {
        await knex('profiles').where('id', firstProfile.id).update({ is_default: true });
      }
    }
  }
}

export async function down(knex) {
  await knex.schema.alterTable('proxy_groups', (t) => {
    t.dropColumn('profile_id');
  });

  await knex.schema.alterTable('rulesets', (t) => {
    t.dropColumn('profile_id');
  });

  await knex.schema.alterTable('profiles', (t) => {
    t.dropColumn('is_default');
  });
}
