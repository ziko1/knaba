/** Runtime authority inputs. No I/O, normalization of company IDs or fallback
 * for injected worker options. Validation errors never echo configuration. */
type RuntimeMode = 'DEMO' | 'TEST' | 'PRODUCTION';

const placeholderReleaseSha = '0'.repeat(40);

/** Grammar and agreement are configuration guards, not source attestation. */
export function requireReleaseSha(value: unknown): string {
  if (typeof value !== 'string' || value.length !== 40 || !/^[a-f0-9]{40}$/.test(value) || value === placeholderReleaseSha) {
    throw new Error('RELEASE_SHA_REQUIRED_OR_INVALID');
  }
  return value;
}

export function resolveBuildSha(mode: RuntimeMode, environmentSha: unknown, compiledSha: unknown): string {
  if (mode !== 'DEMO' && mode !== 'TEST' && mode !== 'PRODUCTION') throw new Error('APP_MODE_REQUIRED_OR_INVALID');
  const configured = environmentSha === undefined ? undefined : requireReleaseSha(environmentSha);
  if (mode === 'PRODUCTION' && configured === undefined) throw new Error('RELEASE_SHA_REQUIRED_OR_INVALID');
  const embedded = compiledSha === undefined ? undefined : requireReleaseSha(compiledSha);
  if (configured !== undefined && embedded !== undefined && configured !== embedded) throw new Error('RELEASE_SHA_MISMATCH');
  // Compatibility for direct DEMO/TEST source startup with neither SHA supplied.
  // A sentinel is never a release identity; provided placeholders are rejected.
  return embedded ?? configured ?? placeholderReleaseSha;
}

export function requireCompanyId(value: unknown, mode: RuntimeMode, allowDemoFallback = false): string {
  const company = value === undefined && allowDemoFallback && mode !== 'PRODUCTION' ? 'knaba-demo' : value;
  if (typeof company !== 'string' || company !== company.trim() || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(company) ||
      (mode === 'PRODUCTION' && (company === 'knaba-demo' || company === 'knaba-de-demo'))) {
    throw new Error('COMPANY_ID_REQUIRED_OR_INVALID');
  }
  return company;
}

/** Returns a parsed origin for API authority comparisons. Worker callers keep
 * their validated raw value: existing Telegram tickets bind that exact string. */
export function parsePublicOrigin(value: unknown, mode: RuntimeMode): URL | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string' && value === value.trim() && /^https?:\/\/[^\s/?#\\]+\/?$/i.test(value)) {
    try {
      const origin = new URL(value);
      if (origin.hostname && !origin.username && !origin.password && origin.pathname === '/' &&
          !origin.search && !origin.hash && (mode !== 'PRODUCTION' || origin.protocol === 'https:')) return origin;
    } catch { /* Report only the field, never credentials or a configured URL. */ }
  }
  throw new Error('PUBLIC_ORIGIN_INVALID');
}
