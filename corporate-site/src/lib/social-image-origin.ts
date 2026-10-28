/** A native TEST asset is hosted separately from the retained SEO canonical. */
export function resolveSocialImageOrigin(
  site: { origin: string; temporary: boolean },
  hostingMode: string | undefined,
  configuredOrigin: string | undefined,
): string {
  if (!site.temporary || hostingMode !== 'sites') return site.origin;
  const message = 'Temporary Sites builds require PUBLIC_KNABA_ASSET_ORIGIN as an HTTPS origin without credentials, path, query or fragment.';
  let url: URL;
  try { url = new URL(configuredOrigin ?? ''); } catch { throw new Error(message); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error(message);
  return url.origin;
}
