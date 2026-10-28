/** Distribution URLs are supplied only after verified signed builds. Never guess a binary link. */
function httpsUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || !value.trim() || value.length > 1200) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
        url.search || url.hash || url.port) return null;
    return url;
  } catch { return null; }
}
const companyHosts = new Set(['knaba.de', 'www.knaba.de', 'kneba.vsp.rest']);
export function androidDistributionUrl(raw: unknown, extraHost?: string): string | null {
  const url = httpsUrl(raw);
  if (!url || !/\/[A-Za-z0-9._-]+\.apk$/i.test(url.pathname)) return null;
  const hostname = url.hostname.toLowerCase();
  const custom = typeof extraHost === 'string' && /^[a-z0-9.-]{4,253}$/i.test(extraHost)
    ? extraHost.toLowerCase() : '';
  if (companyHosts.has(hostname) || (custom && hostname === custom)) return url.href;
  if (hostname === 'github.com' && /^\/ziko1\/knaba\/releases\/download\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.apk$/i.test(url.pathname)) return url.href;
  return null;
}
export function iosDistributionUrl(raw: unknown): string | null {
  const url = httpsUrl(raw);
  if (!url) return null;
  if (url.hostname === 'testflight.apple.com' && /^\/join\/[a-z0-9]{5,24}$/i.test(url.pathname)) return url.href;
  if (url.hostname === 'apps.apple.com' && /^\/(?:[a-z]{2}\/)?app\/(?:[^/]+\/)?id\d+\/?$/i.test(url.pathname)) return url.href;
  return null;
}
export function erpConsoleUrl(raw: unknown): string | null {
  const url = httpsUrl(raw);
  if (!url || !['', '/'].includes(url.pathname)) return null;
  return url.origin + '/console';
}
