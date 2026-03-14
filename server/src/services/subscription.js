import yaml from 'js-yaml';
import { httpRequest } from '../utils/http.js';

/**
 * Parse the `subscription-userinfo` header value into structured data.
 * Header format: upload=bytes; download=bytes; total=bytes; expire=timestamp
 */
function parseUserinfoHeader(userinfo) {
  const result = { upload: 0, download: 0, total: 0, expire: 0, expire_date: null };

  if (!userinfo) return result;

  for (const part of userinfo.split(';')) {
    const [key, val] = part.trim().split('=');
    if (key && val) {
      const k = key.trim().toLowerCase();
      const v = parseInt(val.trim(), 10);
      if (k in result) {
        result[k] = v;
      }
    }
  }

  if (result.expire > 0) {
    result.expire_date = new Date(result.expire * 1000).toISOString();
  }

  return result;
}

/**
 * Parse the `subscription-userinfo` header from a subscription URL.
 * Tries HEAD first; if the header is missing, falls back to GET
 * (some providers only return the header on GET responses).
 * @returns {{ upload, download, total, expire, expire_date }}
 */
export async function parseSubscriptionInfo(url) {
  // 1. Try HEAD (lightweight)
  try {
    const { headers } = await httpRequest(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'ClashMeta/1.0' },
      signal: AbortSignal.timeout(15000),
    });

    const userinfo = headers['subscription-userinfo'];
    if (userinfo) {
      return parseUserinfoHeader(userinfo);
    }
  } catch {
    // HEAD failed entirely — fall through to GET
  }

  // 2. Fallback: GET request (some providers only return header on GET)
  try {
    const { headers, body } = await httpRequest(url, {
      method: 'GET',
      headers: { 'User-Agent': 'ClashMeta/1.0' },
      signal: AbortSignal.timeout(30000),
    });

    // Consume body to avoid resource leak
    await body.text();

    const userinfo = headers['subscription-userinfo'];
    return parseUserinfoHeader(userinfo);
  } catch {
    return { upload: 0, download: 0, total: 0, expire: 0, expire_date: null };
  }
}

/**
 * Fetch and parse nodes from a subscription URL for statistics.
 * Returns: { node_count, countries: { 'HK': n, 'JP': n, ... }, rates: { '1x': n, '2x': n, ... } }
 */
export async function fetchAndParseNodes(url, filterRegex = '') {
  const { body } = await httpRequest(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'ClashMeta/1.0',
    },
    signal: AbortSignal.timeout(30000),
  });

  const text = await body.text();
  let config;

  try {
    config = yaml.load(text);
  } catch {
    // Try base64 decode (some subscriptions return base64 encoded content)
    try {
      const decoded = Buffer.from(text, 'base64').toString('utf-8');
      config = yaml.load(decoded);
    } catch {
      return { node_count: 0, countries: {}, rates: {}, error: 'Unable to parse subscription content' };
    }
  }

  const proxies = config?.proxies || [];

  // Country detection patterns
  const countryPatterns = [
    { pattern: /🇭🇰|香港|HK|Hong\s*Kong/i, code: 'HK', name: '香港' },
    { pattern: /🇹🇼|台湾|TW|Taiwan/i, code: 'TW', name: '台湾' },
    { pattern: /🇯🇵|日本|JP|Japan/i, code: 'JP', name: '日本' },
    { pattern: /🇰🇷|韩国|KR|Korea/i, code: 'KR', name: '韩国' },
    { pattern: /🇸🇬|新加坡|SG|Singapore/i, code: 'SG', name: '新加坡' },
    { pattern: /🇺🇸|美国|US|United\s*States|America/i, code: 'US', name: '美国' },
    { pattern: /🇬🇧|英国|UK|GB|United\s*Kingdom/i, code: 'GB', name: '英国' },
    { pattern: /🇩🇪|德国|DE|Germany/i, code: 'DE', name: '德国' },
    { pattern: /🇫🇷|法国|FR|France/i, code: 'FR', name: '法国' },
    { pattern: /🇨🇦|加拿大|CA|Canada/i, code: 'CA', name: '加拿大' },
    { pattern: /🇦🇺|澳大利亚|AU|Australia/i, code: 'AU', name: '澳大利亚' },
    { pattern: /🇮🇳|印度|IN|India/i, code: 'IN', name: '印度' },
    { pattern: /🇷🇺|俄罗斯|RU|Russia/i, code: 'RU', name: '俄罗斯' },
    { pattern: /🇧🇷|巴西|BR|Brazil/i, code: 'BR', name: '巴西' },
    { pattern: /🇹🇷|土耳其|TR|Turkey/i, code: 'TR', name: '土耳其' },
    { pattern: /🇦🇷|阿根廷|AR|Argentina/i, code: 'AR', name: '阿根廷' },
    { pattern: /🇵🇭|菲律宾|PH|Philippines/i, code: 'PH', name: '菲律宾' },
    { pattern: /🇹🇭|泰国|TH|Thailand/i, code: 'TH', name: '泰国' },
    { pattern: /🇲🇾|马来西亚|MY|Malaysia/i, code: 'MY', name: '马来西亚' },
    { pattern: /🇮🇩|印尼|ID|Indonesia/i, code: 'ID', name: '印尼' },
  ];

  // Rate/multiplier detection
  const ratePattern = /(?:(\d+(?:\.\d+)?)\s*[xX×倍])|(?:[xX×倍]\s*(\d+(?:\.\d+)?))|(?:倍率\s*(\d+(?:\.\d+)?))/;

  const countries = {};
  const rates = {};
  let filteredCount = 0;

  const filterRe = filterRegex ? new RegExp(filterRegex, 'i') : null;

  for (const proxy of proxies) {
    const name = proxy.name || '';

    // Apply filter
    if (filterRe && !filterRe.test(name)) {
      continue;
    }
    filteredCount++;

    // Detect country
    let matched = false;
    for (const { pattern, code } of countryPatterns) {
      if (pattern.test(name)) {
        countries[code] = (countries[code] || 0) + 1;
        matched = true;
        break;
      }
    }
    if (!matched) {
      countries['OTHER'] = (countries['OTHER'] || 0) + 1;
    }

    // Detect rate
    const rateMatch = name.match(ratePattern);
    if (rateMatch) {
      const rate = rateMatch[1] || rateMatch[2] || rateMatch[3];
      const key = `${rate}x`;
      rates[key] = (rates[key] || 0) + 1;
    } else {
      rates['1x'] = (rates['1x'] || 0) + 1;
    }
  }

  return {
    node_count: filteredCount,
    total_nodes: proxies.length,
    countries,
    rates,
  };
}
