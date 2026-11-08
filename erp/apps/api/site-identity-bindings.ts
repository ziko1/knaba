import { createHash, randomUUID } from 'node:crypto';
import { Database, PgTransaction } from './database.ts';
import { DomainError } from '../../packages/domain/core.ts';

/** Identity storage, integrated by SiteIdentityFlow's F2 dual-session proof.
 * The caller validates both current sessions and consumes the link proof in the
 * same transaction before calling recordVerifiedLinkIn(). A stored ACTIVE row
 * alone is never an authentication proof or an authorization grant.
 */
export interface SitePrincipal { issuer: string; audience: string; subject: string }
export interface SiteAuthority {
  companyId: string; issuer: string; audience: string;
  identityNamespace: 'site-user-id-v1'; version: number; active: boolean;
  expiresAt?: string;
}
export interface TrustedSiteAuthority extends Readonly<SiteAuthority> { readonly fingerprint: string }

function deny(): never { throw new DomainError('ACCESS_DENIED'); }
function invalid(): never { throw new DomainError('VALIDATION_ERROR'); }
function bounded(value: unknown, bytes: number): value is string {
  return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= bytes && !/[\u0000-\u0020\u007f]/.test(value);
}
function exactObject(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  if (Object.keys(value).some(key => !keys.includes(key))) return invalid();
  return value as Record<string, unknown>;
}
function instant(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}
function issuerValid(value: unknown): value is string {
  if (!bounded(value, 512)) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password && !url.search && !url.hash; }
  catch { return false; }
}
function principal(value: unknown): SitePrincipal {
  const p = exactObject(value, ['issuer', 'audience', 'subject']);
  if (!issuerValid(p.issuer) || !bounded(p.audience, 256) || !bounded(p.subject, 256)) return invalid();
  // Deliberately no lowercasing, URL normalization, provider aliases or email join.
  return { issuer: p.issuer, audience: p.audience, subject: p.subject };
}

/** Server-owned, immutable configuration. Empty configuration denies every principal.
 * Issuer identifies the stable site ID namespace, not a caller-supplied Host/origin.
 */
export class TrustedSiteAuthorities {
  private readonly entries = new Map<string, TrustedSiteAuthority>();
  constructor(input: unknown = []) {
    if (!Array.isArray(input) || input.length > 32) return invalid();
    for (const value of input) {
      const row = exactObject(value, ['companyId', 'issuer', 'audience', 'identityNamespace', 'version', 'active', 'expiresAt']);
      if (!bounded(row.companyId, 128) || !issuerValid(row.issuer) || !bounded(row.audience, 256) ||
          row.identityNamespace !== 'site-user-id-v1' || !Number.isInteger(row.version) ||
          (row.version as number) < 1 || (row.version as number) > 2_147_483_647 || typeof row.active !== 'boolean' ||
          row.expiresAt !== undefined && !instant(row.expiresAt)) return invalid();
      const authority: SiteAuthority = { companyId: row.companyId, issuer: row.issuer, audience: row.audience,
        identityNamespace: 'site-user-id-v1', version: row.version as number, active: row.active,
        ...(row.expiresAt === undefined ? {} : { expiresAt: row.expiresAt as string }) };
      const key = this.key(authority.companyId, authority.issuer, authority.audience);
      if (this.entries.has(key)) return invalid();
      const fingerprint = createHash('sha256').update(JSON.stringify([
        authority.companyId, authority.issuer, authority.audience, authority.identityNamespace,
        authority.version, authority.active, authority.expiresAt ?? null,
      ])).digest('hex');
      this.entries.set(key, Object.freeze({ ...authority, fingerprint }));
    }
  }
  private key(companyId: string, issuer: string, audience: string) { return JSON.stringify([companyId, issuer, audience]); }
  require(companyId: string, identity: SitePrincipal, now: Date): TrustedSiteAuthority {
    const value = principal(identity);
    const authority = this.entries.get(this.key(companyId, value.issuer, value.audience));
    if (!Number.isFinite(now.getTime()) || !authority?.active || authority.expiresAt && Date.parse(authority.expiresAt) <= now.getTime()) return deny();
    return authority;
  }
}

export interface SiteIdentityBinding {
  id: string; companyId: string; issuer: string; audience: string; subject: string;
  siteUserId: string; userId: string; status: 'ACTIVE' | 'REVOKED'; version: number;
  trustVersion: number; trustFingerprint: string; expiresAt: string | null;
  createdAt: string; revokedAt: string | null;
  generation: number;
}
function binding(row: any): SiteIdentityBinding {
  return { id: row.id, companyId: row.company_id, issuer: row.issuer, audience: row.audience,
    subject: row.subject, siteUserId: row.site_user_id, userId: row.user_id, status: row.status,
    version: row.version, trustVersion: row.trust_version, trustFingerprint: row.trust_fingerprint,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(), revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    generation: row.generation ?? 1 };
}

export class SiteIdentityBindings {
  constructor(private readonly db: Database, private readonly companyId: string,
    private readonly trustedAuthorities: () => TrustedSiteAuthorities = () => new TrustedSiteAuthorities()) {
    if (!bounded(companyId, 128)) invalid();
  }
  private scope(tx: PgTransaction) { if (tx.companyId !== this.companyId) deny(); }
  private async clock(tx: PgTransaction): Promise<Date> {
    this.scope(tx); return new Date((await tx.query('SELECT clock_timestamp() AS now')).rows[0].now);
  }
  private async activeUser(tx: PgTransaction, userId: string) {
    if (!bounded(userId, 128)) return deny();
    try {
      const user = await tx.get('user', userId);
      // Federation requires explicit active=true; legacy password login remains unchanged.
      if (user.companyId !== this.companyId || user.data.active !== true) return deny();
    } catch (error) { if (error instanceof DomainError) return deny(); throw error; }
  }

  /** Internal F2 integration point: caller owns dual-session proof consumption.
   * tx.actorId must be the existing ERP target. This method neither validates a
   * network proof nor opens/commits its own transaction, so F2 can be atomic.
   */
  async recordVerifiedLinkIn(tx: PgTransaction, identity: SitePrincipal, proofReference: string, expiresAt?: string,
    receipt?: { bindingId: string; challengeId: string; generation: number; predecessorId: string | null }): Promise<SiteIdentityBinding> {
    this.scope(tx); const p = principal(identity); const now = await this.clock(tx);
    if (!/^[a-f0-9]{64}$/.test(proofReference) || expiresAt !== undefined && (!instant(expiresAt) || Date.parse(expiresAt) <= now.getTime())) return invalid();
    const trust = this.trustedAuthorities().require(this.companyId, p, now);
    await this.activeUser(tx, tx.actorId);
    if (receipt && (!Number.isInteger(receipt.generation) || receipt.generation < 1 ||
        ![receipt.bindingId,receipt.challengeId,...(receipt.predecessorId ? [receipt.predecessorId] : [])].every(value =>
          /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)))) return invalid();
    const id = receipt?.bindingId ?? randomUUID();
    try {
      const result = await tx.query(`INSERT INTO site_identity_bindings
        (company_id,id,issuer,audience,subject,site_user_id,user_id,trust_version,trust_fingerprint,proof_reference,created_by,expires_at,generation,predecessor_id,f2_challenge_id)
        VALUES($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$6,$10,$11,$12,$13) RETURNING *`,
        [this.companyId,id,p.issuer,p.audience,p.subject,tx.actorId,trust.version,trust.fingerprint,proofReference,expiresAt ?? null,
          receipt?.generation ?? 1,receipt?.predecessorId ?? null,receipt?.challengeId ?? null]);
      await tx.query(`INSERT INTO audit_log(company_id,actor_id,action,aggregate_kind,aggregate_id,detail)
        VALUES($1,$2,'SITE_IDENTITY_LINK_RECORDED','site_identity_binding',$3,$4)`,
        [this.companyId,tx.actorId,id,JSON.stringify({ version: 1, trustVersion: trust.version, trustFingerprint: trust.fingerprint, proofReference, expiresAt: expiresAt ?? null })]);
      // A configuration change while waiting for SQL makes the whole write fail.
      const finishedAt = await this.clock(tx);
      if (this.trustedAuthorities().require(this.companyId,p,finishedAt).fingerprint !== trust.fingerprint ||
          expiresAt !== undefined && Date.parse(expiresAt) <= finishedAt.getTime()) return deny();
      return binding(result.rows[0]);
    } catch (error: any) {
      if (error?.code === '23505' || error?.code === '23503') return deny();
      throw error;
    }
  }

  /** Identity lookup only. The result is not an Actor, session or cached grant. */
  async resolve(identity: SitePrincipal): Promise<SiteIdentityBinding> {
    const p = principal(identity);
    return this.db.transaction(this.companyId,'SITE_IDENTITY_LOOKUP',tx => this.resolveIn(tx,p),10000,true);
  }

  /** Reuse the caller's company transaction; never open a nested authority lock. */
  async resolveIn(tx: PgTransaction, identity: SitePrincipal,
    expected?: Pick<SiteIdentityBinding,'id'|'userId'|'version'|'generation'>): Promise<SiteIdentityBinding> {
      this.scope(tx); const p=principal(identity);
      const now = await this.clock(tx), trust = this.trustedAuthorities().require(this.companyId,p,now);
      const result = await tx.query(`SELECT * FROM site_identity_bindings WHERE company_id=$1 AND issuer=$2 AND subject=$3
        AND audience=$4 AND status='ACTIVE' AND (expires_at IS NULL OR expires_at>clock_timestamp())`,[this.companyId,p.issuer,p.subject,p.audience]);
      const row = result.rows[0];
      if (!row || row.trust_version !== trust.version || row.trust_fingerprint !== trust.fingerprint || row.site_user_id !== p.subject) return deny();
      await this.activeUser(tx,row.user_id);
      const finishedAt = await this.clock(tx);
      if (this.trustedAuthorities().require(this.companyId,p,finishedAt).fingerprint !== trust.fingerprint ||
          row.expires_at && new Date(row.expires_at).getTime() <= finishedAt.getTime()) return deny();
      const found=binding(row);
      if(expected&&(found.id!==expected.id||found.userId!==expected.userId||found.version!==expected.version||found.generation!==expected.generation))return deny();
      return found;
  }

  /** Internal unlink storage step. Revocation is terminal in F1. Even expired or
   * disabled trust can be revoked; reducing access must not require that issuer.
   */
  async revokeIn(tx: PgTransaction, id: string, expectedVersion: number): Promise<SiteIdentityBinding> {
    this.scope(tx);
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id) ||
        !Number.isInteger(expectedVersion) || expectedVersion < 1) return invalid();
    const previous = (await tx.query('SELECT * FROM site_identity_bindings WHERE company_id=$1 AND id=$2 AND user_id=$3',[this.companyId,id,tx.actorId])).rows[0];
    if (!previous) return deny();
    if (previous.status !== 'ACTIVE' || previous.version !== expectedVersion) throw new DomainError('VERSION_CONFLICT');
    const result = await tx.query(`UPDATE site_identity_bindings SET status='REVOKED',version=version+1,
      revoked_at=clock_timestamp(),revoked_by=$3 WHERE company_id=$1 AND id=$2 AND user_id=$3 AND version=$4 AND status='ACTIVE' RETURNING *`,
      [this.companyId,id,tx.actorId,expectedVersion]);
    if (!result.rows[0]) throw new DomainError('VERSION_CONFLICT');
    await tx.query('UPDATE site_auth_sessions SET revoked_at=clock_timestamp() WHERE company_id=$1 AND binding_id=$2 AND revoked_at IS NULL',[this.companyId,id]);
    await tx.query(`INSERT INTO audit_log(company_id,actor_id,action,aggregate_kind,aggregate_id,detail)
      VALUES($1,$2,'SITE_IDENTITY_LINK_REVOKED','site_identity_binding',$3,$4)`,
      [this.companyId,tx.actorId,id,JSON.stringify({ version: expectedVersion + 1 })]);
    return binding(result.rows[0]);
  }
}
