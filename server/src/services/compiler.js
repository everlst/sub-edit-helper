import yaml from 'js-yaml';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../db/index.js';
import { decrypt } from '../utils/crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Default system DNS configuration (lowest priority).
 */
const DEFAULT_DNS = {
  enable: true,
  listen: '0.0.0.0:1053',
  'enhanced-mode': 'fake-ip',
  'fake-ip-range': '198.18.0.1/16',
  nameserver: [
    'https://dns.alidns.com/dns-query',
    'https://doh.pub/dns-query',
  ],
  fallback: [
    'https://dns.cloudflare.com/dns-query',
    'https://dns.google/dns-query',
  ],
  'fallback-filter': {
    geoip: true,
    'geoip-code': 'CN',
  },
};

/**
 * Default Clash/Mihomo base configuration.
 */
const DEFAULT_BASE_CONFIG = {
  'mixed-port': 7890,
  'allow-lan': true,
  mode: 'rule',
  'log-level': 'info',
  'external-controller': '0.0.0.0:9090',
  'unified-delay': true,
  'tcp-concurrent': true,
  'geodata-mode': true,
  'find-process-mode': 'strict',
  'global-client-fingerprint': 'chrome',
};

/**
 * Load built-in rules from base-rules.yaml.
 * Returns array of rule strings.
 */
function loadBuiltinRules() {
  const rulesPath = path.join(__dirname, '..', '..', '..', 'base-rules.yaml');
  if (!fs.existsSync(rulesPath)) {
    return [];
  }
  const content = fs.readFileSync(rulesPath, 'utf-8');
  const parsed = yaml.load(content);
  return parsed?.rules || [];
}

/**
 * Parse user override rules from YAML text.
 * Format: rules that start with + are added, - are removed.
 * Plain rules replace the builtin entirely if present.
 */
function applyUserOverrides(builtinRules, userOverridesText) {
  if (!userOverridesText?.trim()) {
    return builtinRules;
  }

  let overrides;
  try {
    overrides = yaml.load(userOverridesText);
  } catch {
    return builtinRules; // Invalid YAML, ignore
  }

  if (!overrides) return builtinRules;

  // If user provides a full rules array, merge with builtin
  const addRules = overrides.add || [];
  const removeRules = new Set(overrides.remove || []);

  let result = builtinRules.filter((r) => !removeRules.has(r));

  // Insert added rules at the beginning (before builtin, after user-priority rules)
  if (addRules.length > 0) {
    // Find the index of the first MATCH rule (the catch-all)
    const matchIdx = result.findIndex((r) => r.startsWith('MATCH,'));
    if (matchIdx >= 0) {
      result.splice(matchIdx, 0, ...addRules);
    } else {
      result.push(...addRules);
    }
  }

  return result;
}

/**
 * Build proxy-providers section for the YAML config.
 * Directly uses the original subscription URL (decrypted from DB).
 * When a provider has show_sub_info enabled, generates an additional
 * "{name}-订阅信息" proxy-provider for subscription info display.
 */
function buildProxyProviders(providers) {
  const proxyProviders = {};

  for (const provider of providers) {
    const key = provider.name;
    const originalUrl = decrypt(provider.url_encrypted);
    const providerConfig = {
      type: 'http',
      url: originalUrl,
      interval: 3600,
      path: `./providers/provider-${provider.id}.yaml`,
      'health-check': {
        enable: true,
        url: 'https://www.gstatic.com/generate_204',
        interval: 300,
        lazy: true,
      },
    };

    // Apply provider-level filter
    if (provider.filter?.trim()) {
      providerConfig.filter = provider.filter;
    }

    proxyProviders[key] = providerConfig;

    // Generate subscription info provider if enabled
    if (provider.show_sub_info) {
      const infoKey = `${provider.name}-subinfo`;
      const infoFilter = provider.sub_info_filter?.trim() || 'Traffic|Expire';
      const infoPrefix = provider.sub_info_prefix?.trim() || `[${provider.name}] `;

      proxyProviders[infoKey] = {
        type: 'http',
        url: originalUrl,
        interval: 3600,
        path: `./providers/provider-${provider.id}-subinfo.yaml`,
        filter: infoFilter,
        'health-check': {
          enable: false,
        },
        override: {
          'additional-prefix': infoPrefix,
        },
      };
    }
  }

  return proxyProviders;
}

/**
 * Detect circular references in proxy group definitions.
 * Uses DFS-based topological sort.
 * @param {Array} groups - array of group objects with { name, proxies }
 * @throws {Error} if a cycle is detected, with the cycle path in the message
 */
function detectCyclicReferences(groups) {
  const groupNames = new Set(groups.map((g) => g.name));
  const adj = {};

  for (const g of groups) {
    adj[g.name] = [];
    const proxies = JSON.parse(g.proxies || '[]');
    for (const ref of proxies) {
      if (groupNames.has(ref)) {
        adj[g.name].push(ref);
      }
    }
  }

  // 0 = unvisited, 1 = in-stack, 2 = done
  const state = {};
  const parent = {};

  function dfs(node) {
    state[node] = 1;
    for (const neighbor of (adj[node] || [])) {
      if (state[neighbor] === 1) {
        // Found cycle — reconstruct path
        const cycle = [neighbor, node];
        let cur = node;
        while (parent[cur] !== undefined && parent[cur] !== neighbor) {
          cur = parent[cur];
          cycle.push(cur);
        }
        cycle.reverse();
        throw new Error(`检测到循环引用：${cycle.join(' → ')}`);
      }
      if (!state[neighbor]) {
        parent[neighbor] = node;
        dfs(neighbor);
      }
    }
    state[node] = 2;
  }

  for (const name of groupNames) {
    if (!state[name]) {
      dfs(name);
    }
  }
}

/**
 * Build proxy-groups section from custom user-defined groups in DB.
 * Each group record maps directly to a Clash proxy-group entry.
 */
function buildProxyGroups(groups, providers) {
  // Build provider id -> key mapping (using provider name as key)
  const providerKeyMap = {};
  const providerSubInfoKeyMap = {};
  for (const p of providers) {
    providerKeyMap[p.id] = p.name;
    if (p.show_sub_info) {
      providerSubInfoKeyMap[p.id] = `${p.name}-subinfo`;
    }
  }

  const result = [];

  for (const g of groups) {
    const proxies = JSON.parse(g.proxies || '[]');
    const useProviderIds = JSON.parse(g.use_providers || '[]');
    const useSubInfoProviderIds = JSON.parse(g.use_sub_info_providers || '[]');

    const entry = { name: g.name, type: g.type };

    // Add proxies (group name references / built-in like DIRECT, REJECT)
    if (proxies.length > 0) {
      entry.proxies = proxies;
    }

    // Map provider IDs to provider keys for `use`
    const useKeys = [];
    for (const pid of useProviderIds) {
      if (providerKeyMap[pid]) {
        useKeys.push(providerKeyMap[pid]);
      }
    }
    // Also add sub-info provider keys if specified
    for (const pid of useSubInfoProviderIds) {
      if (providerSubInfoKeyMap[pid]) {
        useKeys.push(providerSubInfoKeyMap[pid]);
      }
    }
    if (useKeys.length > 0) {
      entry['use'] = useKeys;
    }

    // url-test / fallback / load-balance specific fields
    if (['url-test', 'fallback', 'load-balance'].includes(g.type)) {
      entry.url = g.test_url || 'http://www.gstatic.com/generate_204';
      entry.interval = g.interval ?? 300;
      entry.timeout = g.timeout ?? 5000;
      if (g.type === 'url-test') {
        entry.tolerance = g.tolerance ?? 50;
      }
    }

    // Filter
    if (g.filter?.trim()) {
      entry.filter = g.filter;
    }

    // Hidden
    if (g.hidden) {
      entry.hidden = true;
    }

    result.push(entry);
  }

  return result;
}

/**
 * Merge DNS configuration with priority:
 * user override > primary provider (first enabled) > system default
 */
function mergeDns(userDnsOverrides) {
  let dns = { ...DEFAULT_DNS };

  // User overrides (highest priority)
  if (userDnsOverrides && typeof userDnsOverrides === 'object') {
    dns = deepMerge(dns, userDnsOverrides);
  }

  return dns;
}

/**
 * Simple deep merge for plain objects.
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') {
      result[key] = deepMerge(target[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Main config compiler.
 * Reads all data from DB and produces a complete Clash/Mihomo YAML.
 * @param {Object} opts
 * @param {number[]} [opts.providerIds] - filter providers by IDs (from profile)
 * @param {number}   [opts.profileId]   - profile ID to load scoped groups & rules
 */
export async function compileConfig({ providerIds, profileId } = {}) {
  const db = getDb();

  // 1. Load enabled providers in sort order, optionally filtered by profile
  let providerQuery = db('providers')
    .where('enabled', 1)
    .orderBy('sort_order', 'asc');

  if (providerIds && providerIds.length > 0) {
    providerQuery = providerQuery.whereIn('id', providerIds);
  }

  const providers = await providerQuery;

  if (providers.length === 0) {
    throw new Error('No enabled providers. Add at least one subscription source.');
  }

  // 2. Load custom proxy groups (scoped to profile if specified)
  let groupsQuery = db('proxy_groups').orderBy('sort_order', 'asc');
  if (profileId) {
    groupsQuery = groupsQuery.where('profile_id', profileId);
  }
  const customGroups = await groupsQuery;

  // Validate: detect cyclic references before compiling
  if (customGroups.length > 0) {
    detectCyclicReferences(customGroups);
  }

  // 3. Load policy profile (still used for potential future features)
  const policyRow = await db('policy_profiles').where('id', 1).first();
  const policyProfile = policyRow ? {
    country_filter: JSON.parse(policyRow.country_filter || '[]'),
    rate_regex: policyRow.rate_regex || '',
    group_template: JSON.parse(policyRow.group_template || '{}'),
    sort_config: JSON.parse(policyRow.sort_config || '{}'),
  } : {};

  // 3. Load rules (scoped to profile if specified)
  let rulesetRow;
  if (profileId) {
    rulesetRow = await db('rulesets').where('profile_id', profileId).first();
  }
  if (!rulesetRow) {
    rulesetRow = await db('rulesets').where('id', 1).first();
  }
  const builtinRules = loadBuiltinRules();
  const userOverrides = rulesetRow?.user_overrides || '';
  const rules = applyUserOverrides(builtinRules, userOverrides);

  // 4. Load user DNS overrides from settings
  const dnsOverrideSetting = await db('settings').where('key', 'dns_override').first();
  let userDnsOverrides = null;
  if (dnsOverrideSetting?.value) {
    try {
      userDnsOverrides = JSON.parse(dnsOverrideSetting.value);
    } catch { /* ignore */ }
  }

  // 5. Build config sections
  const proxyProviders = buildProxyProviders(providers);

  // Use custom groups if defined, otherwise generate sensible defaults
  let proxyGroups;
  if (customGroups.length > 0) {
    proxyGroups = buildProxyGroups(customGroups, providers);
  } else {
    // Fallback: generate default groups when no custom groups exist
    const providerKeys = providers.map((p) => p.name);
    proxyGroups = [
      {
        name: '🚀 节点选择',
        type: 'select',
        proxies: ['⚡ 自动选择', 'DIRECT'],
        'use': providerKeys,
      },
      {
        name: '⚡ 自动选择',
        type: 'url-test',
        url: 'https://www.gstatic.com/generate_204',
        interval: 300,
        tolerance: 50,
        'use': providerKeys,
      },
    ];
  }

  const dns = mergeDns(userDnsOverrides);

  // 7. Assemble final config
  const config = {
    ...DEFAULT_BASE_CONFIG,
    dns,
    'proxy-providers': proxyProviders,
    'proxy-groups': proxyGroups,
    rules,
  };

  // 8. Generate YAML with comments
  const yamlText = [
    '# =============================================',
    '# Sub Edit Helper - Auto Generated Config',
    `# Generated: ${new Date().toISOString()}`,
    `# Providers: ${providers.map((p) => p.name).join(', ')}`,
    '# =============================================',
    '',
    yaml.dump(config, {
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: false,
      noRefs: true,
      sortKeys: false,
    }),
  ].join('\n');

  return yamlText;
}
