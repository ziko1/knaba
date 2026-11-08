/** Runtime authority inputs. No I/O, normalization of company IDs or fallback
 * for injected worker options. Validation errors never echo configuration. */
type RuntimeMode = 'DEMO' | 'TEST' | 'PRODUCTION';

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
