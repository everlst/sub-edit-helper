import { request, interceptors, Agent } from 'undici';

/**
 * Shared undici dispatcher with redirect support.
 * undici v7+ removed maxRedirections from request options;
 * redirects must be handled via the redirect interceptor.
 */
const redirectAgent = new Agent().compose(
  interceptors.redirect({ maxRedirections: 5 })
);

/**
 * Make an HTTP request with automatic redirect following.
 * Drop-in replacement for undici.request() with redirect support.
 *
 * @param {string} url
 * @param {object} opts - standard undici request options (method, headers, signal, etc.)
 * @returns {Promise<import('undici').Dispatcher.ResponseData>}
 */
export function httpRequest(url, opts = {}) {
  return request(url, {
    ...opts,
    dispatcher: redirectAgent,
  });
}
