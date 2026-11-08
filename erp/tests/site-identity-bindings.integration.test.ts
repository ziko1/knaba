import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Database } from '../apps/api/database.ts';
import { SiteIdentityBindings, TrustedSiteAuthorities } from '../apps/api/site-identity-bindings.ts';

const postgres = process.env.DATABASE_URL ? describe : describe.skip;
const issuer = 'https://identity.example.test/site-authority-v1', audience = 'knaba-erp-test';
const proof = createHash('sha256').update('synthetic already-validated F2 proof reference; not a live token').digest('hex');
const principal = { issuer, audience, subject: 'SyntheticSiteUser-A' };

// Genuine PostgreSQL transactions. The caller proof/session validation is an
// explicit F2 fixture boundary, not an assertion that SSO exists or is enabled.
postgres('F1 PostgreSQL site identity storage and tenant isolation', () => {
  let db: Database, company: string, registry: TrustedSiteAuthorities, bindings: SiteIdentityBindings;
  const trust = (companyId: string, patch = {}) => ({ companyId, issuer, audience, identityNamespace: 'site-user-id-v1', version: 1, active: true, ...patch });
  beforeAll(async () => { expect(process.env.APP_MODE).toBe('TEST'); db = new Database(); await db.migrate(); });
  beforeEach(async () => {
    company = 'identity-f1-' + randomUUID(); registry = new TrustedSiteAuthorities([trust(company)]);
    bindings = new SiteIdentityBindings(db,company,() => registry);
    await db.transaction(company,'SYNTHETIC_SETUP',async tx => {
      for (const id of ['user-a','user-b']) await tx.add('user',{active:true,roles:['CLIENT'],email:'equal@example.test',synthetic:true},id);
    });
  });
  afterAll(async () => { await db?.close(); });
  const record = (user='user-a', identity=principal, reference=proof, expiresAt?:string) =>
    db.transaction(company,user,tx => bindings.recordVerifiedLinkIn(tx,identity,reference,expiresAt));
  const revoke = (id:string,version:number,user='user-a') => db.transaction(company,user,tx => bindings.revokeIn(tx,id,version));
  const count = async (table:string, suffix='') => (await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE company_id=$1 ${suffix}`,[company])).rows[0].n;

  it('records an explicit target without email merge, session issuance or membership grants', async () => {
    const before = (await db.query("SELECT id,data FROM aggregates WHERE company_id=$1 AND kind='user' ORDER BY id",[company])).rows;
    const row = await record('user-b'); expect((await bindings.resolve(principal)).userId).toBe('user-b');
    expect(row.siteUserId).toBe(principal.subject); expect(row.version).toBe(1); expect(row.expiresAt).toBeNull();
    expect(await count('auth_sessions')).toBe(0);
    expect(await count('aggregates',"AND kind='customer_membership'")).toBe(0);
    expect((await db.query("SELECT id,data FROM aggregates WHERE company_id=$1 AND kind='user' ORDER BY id",[company])).rows).toEqual(before);
    expect(await count('audit_log',"AND action='SITE_IDENTITY_LINK_RECORDED'")).toBe(1);
    await expect(record('user-a')).rejects.toMatchObject({code:'ACCESS_DENIED'});
  });

  it('keeps equal user IDs and emails in two companies isolated', async () => {
    const other = company+'-other'; registry = new TrustedSiteAuthorities([trust(company),trust(other)]);
    await db.transaction(other,'SYNTHETIC_SETUP',tx => tx.add('user',{active:true,roles:['CLIENT'],email:'equal@example.test'},'user-a'));
    const otherBindings = new SiteIdentityBindings(db,other,() => registry);
    await record('user-b');
    await expect(otherBindings.resolve(principal)).rejects.toMatchObject({code:'ACCESS_DENIED'});
    await db.transaction(other,'user-a',tx => otherBindings.recordVerifiedLinkIn(tx,principal,proof));
    expect((await bindings.resolve(principal)).userId).toBe('user-b');
    expect((await otherBindings.resolve(principal)).userId).toBe('user-a');
    await expect(db.transaction(other,'user-a',tx => bindings.recordVerifiedLinkIn(tx,{...principal,subject:'other'},proof))).rejects.toMatchObject({code:'ACCESS_DENIED'});
  });

  it('does not alias subjects or issuers that differ in case or spelling', async () => {
    const secondIssuer = issuer+'/second'; registry = new TrustedSiteAuthorities([trust(company),trust(company,{issuer:secondIssuer})]);
    await record();
    for (const identity of [{...principal,subject:principal.subject.toLowerCase()},{...principal,issuer:secondIssuer}]) {
      await expect(bindings.resolve(identity)).rejects.toMatchObject({code:'ACCESS_DENIED'});
      await record('user-b',identity); expect((await bindings.resolve(identity)).userId).toBe('user-b');
    }
    expect(await count('site_identity_bindings')).toBe(3);
  });

  it('rejects unknown issuer, wrong audience and caller-selected company/fingerprint', async () => {
    await record();
    for (const identity of [{...principal,issuer:'https://untrusted.example.test'}, {...principal,audience:'other'}, {...principal,companyId:company+'-other'}, {...principal,fingerprint:'fake'}]) {
      await expect(bindings.resolve(identity)).rejects.toBeDefined();
    }
    const none = new SiteIdentityBindings(db,company);
    await expect(none.resolve(principal)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  });

  it('allows exactly one concurrent binding of one principal to different ERP targets', async () => {
    const outcomes = await Promise.allSettled([record('user-a'),record('user-b')]);
    expect(outcomes.filter(r => r.status==='fulfilled')).toHaveLength(1);
    expect(outcomes.filter(r => r.status==='rejected')).toHaveLength(1);
    expect(await count('site_identity_bindings')).toBe(1);
    expect(await count('audit_log',"AND action='SITE_IDENTITY_LINK_RECORDED'")).toBe(1);
  });

  it('denies missing, disabled and not-explicitly-active users at link and lookup', async () => {
    await expect(record('missing')).rejects.toMatchObject({code:'ACCESS_DENIED'});
    await db.transaction(company,'SYNTHETIC_SETUP',tx => tx.add('user',{roles:['CLIENT'],email:'equal@example.test'},'pending'));
    await expect(record('pending')).rejects.toMatchObject({code:'ACCESS_DENIED'});
    await record();
    await db.transaction(company,'SYNTHETIC_DISABLE',async tx => { const user=await tx.get('user','user-a'); await tx.save(user,{...user.data,active:false}); });
    await expect(bindings.resolve(principal)).rejects.toMatchObject({code:'ACCESS_DENIED'});
    await expect(record('user-a',{...principal,subject:'new-subject'})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  });

  it('uses current configuration, rejecting stale version, fingerprint, revoked or expired trust', async () => {
    await record();
    for (const patch of [{version:2},{expiresAt:'2999-01-01T00:00:00.000Z'},{active:false},{expiresAt:'2000-01-01T00:00:00.000Z'}]) {
      registry = new TrustedSiteAuthorities([trust(company,patch)]);
      await expect(bindings.resolve(principal)).rejects.toMatchObject({code:'ACCESS_DENIED'});
    }
    registry = new TrustedSiteAuthorities([trust(company)]);
    expect((await bindings.resolve(principal)).userId).toBe('user-a');
  });

  it('rejects a trust change during the write and rolls back both binding and audit', async () => {
    await expect(db.transaction(company,'user-a',async tx => {
      const original=tx.query.bind(tx);
      tx.query = async (sql,params=[]) => {
        const result=await original(sql,params);
        if (sql.includes("'SITE_IDENTITY_LINK_RECORDED'")) registry = new TrustedSiteAuthorities([trust(company,{version:2})]);
        return result;
      };
      return bindings.recordVerifiedLinkIn(tx,principal,proof);
    })).rejects.toMatchObject({code:'ACCESS_DENIED'});
    expect(await count('site_identity_bindings')).toBe(0);
    expect(await count('audit_log',"AND action='SITE_IDENTITY_LINK_RECORDED'")).toBe(0);
  });

  it('rolls back the binding when the real SQL audit insert fails', async () => {
    await expect(db.transaction(company,'user-a',async tx => {
      const original=tx.query.bind(tx);
      tx.query = (sql,params=[]) => sql.includes("'SITE_IDENTITY_LINK_RECORDED'") ? original('SELECT 1 / 0') : original(sql,params);
      return bindings.recordVerifiedLinkIn(tx,principal,proof);
    })).rejects.toMatchObject({code:'22012'});
    expect(await count('site_identity_bindings')).toBe(0);
    expect(await count('audit_log',"AND action='SITE_IDENTITY_LINK_RECORDED'")).toBe(0);
  });

  it('retains terminal tombstones and uses a CAS version for concurrent revocation', async () => {
    const row=await record();
    const outcomes=await Promise.allSettled([revoke(row.id,1),revoke(row.id,1)]);
    expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(outcomes.filter(r=>r.status==='rejected')).toHaveLength(1);
    await expect(bindings.resolve(principal)).rejects.toMatchObject({code:'ACCESS_DENIED'});
    for (const user of ['user-a','user-b']) await expect(record(user)).rejects.toMatchObject({code:'ACCESS_DENIED'});
    await expect(db.query('DELETE FROM site_identity_bindings WHERE company_id=$1 AND id=$2',[company,row.id])).rejects.toMatchObject({code:'23514'});
    await expect(db.query("UPDATE site_identity_bindings SET status='ACTIVE',revoked_at=NULL,revoked_by=NULL,version=3 WHERE company_id=$1 AND id=$2",[company,row.id])).rejects.toMatchObject({code:'23514'});
    expect(await count('site_identity_bindings',"AND status='REVOKED' AND version=2")).toBe(1);
    expect(await count('audit_log',"AND action='SITE_IDENTITY_LINK_REVOKED'")).toBe(1);
  });

  it('denies a lookup racing a committed revocation under the company lock', async () => {
    const row=await record(); let release!:()=>void, ready!:()=>void;
    const hold=new Promise<void>(r=>release=r), entered=new Promise<void>(r=>ready=r);
    const revoking=db.transaction(company,'user-a',async tx => { await bindings.revokeIn(tx,row.id,1); ready(); await hold; });
    await entered;
    const lookup=bindings.resolve(principal).then(value=>({value}),error=>({error}));
    release(); await revoking;
    expect(await lookup).toMatchObject({error:{code:'ACCESS_DENIED'}});
  });

  it('cannot retarget principal, trust or user through SQL updates', async () => {
    const row=await record();
    await expect(db.query("UPDATE site_identity_bindings SET status='REVOKED',version=2,revoked_at=clock_timestamp(),revoked_by=NULL WHERE company_id=$1 AND id=$2",[company,row.id])).rejects.toMatchObject({code:'23514'});
    for (const set of ["user_id='user-b',created_by='user-b'","subject='other',site_user_id='other'","trust_version=2","audience='new-audience'"]) {
      await expect(db.query(`UPDATE site_identity_bindings SET ${set} WHERE company_id=$1 AND id=$2`,[company,row.id])).rejects.toMatchObject({code:'23514'});
    }
    await expect(revoke(row.id,1,'user-b')).rejects.toMatchObject({code:'ACCESS_DENIED'});
    expect((await bindings.resolve(principal)).userId).toBe('user-a');
  });

  it('denies expired bindings without deleting or rebinding their principal', async () => {
    const authority=registry.require(company,principal,new Date());
    // Synthetic expired row: no external proof is asserted by this fixture.
    await db.query(`INSERT INTO site_identity_bindings(company_id,id,issuer,audience,subject,site_user_id,user_id,
      trust_version,trust_fingerprint,proof_reference,created_by,created_at,expires_at)
      VALUES($1,$2,$3,$4,$5,$5,'user-a',1,$6,$7,'user-a',clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour')`,
      [company,randomUUID(),issuer,audience,principal.subject,authority.fingerprint,proof]);
    await expect(bindings.resolve(principal)).rejects.toMatchObject({code:'ACCESS_DENIED'});
    await expect(record()).rejects.toMatchObject({code:'ACCESS_DENIED'});
    await expect(record('user-a',{...principal,subject:'different'},proof,'2000-01-01T00:00:00.000Z')).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  });

  it('enforces the company/user composite foreign key even below the repository', async () => {
    const other=company+'-other'; await db.transaction(other,'SYNTHETIC_SETUP',tx=>tx.add('user',{active:true},'only-other'));
    const authority=registry.require(company,principal,new Date());
    await expect(db.query(`INSERT INTO site_identity_bindings(company_id,issuer,audience,subject,site_user_id,user_id,
      trust_version,trust_fingerprint,proof_reference,created_by) VALUES($1,$2,$3,$4,$4,'only-other',1,$5,$6,'only-other')`,
      [company,issuer,audience,principal.subject,authority.fingerprint,proof])).rejects.toMatchObject({code:'23503'});
  });

  it('keeps unlink available after issuer disable while still denying resolution', async () => {
    const row=await record(); registry=new TrustedSiteAuthorities();
    expect((await revoke(row.id,1)).status).toBe('REVOKED');
    await expect(bindings.resolve(principal)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  });

  it('upgrades the actual previous schema, is repeatable, and preserves tombstones under old runtime migration', async () => {
    const baseline=await readFile(new URL('./fixtures/site-identity-pre-f1.sql',import.meta.url),'utf8');
    expect(createHash('sha256').update(baseline).digest('hex')).toBe('3a0e72d7da6531a8e8f9e3e732c38c12936f405a7ee342f2bf0ce42b9dc29dc4');
    const schema='f1_upgrade_'+randomUUID().replaceAll('-','');
    await db.query('CREATE SCHEMA '+schema);
    const url=new URL(process.env.DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema);
    const isolated=new Database(url.toString());
    try {
      await isolated.migrate(baseline);
      expect((await isolated.query("SELECT to_regclass('site_identity_bindings') AS name")).rows[0].name).toBeNull();
      await isolated.transaction('synthetic-upgrade','SYNTHETIC_SETUP',tx=>tx.add('user',{active:true,roles:['CLIENT'],email:'equal@example.test'},'old-user'));
      await isolated.migrate(); await isolated.migrate();
      const config=new TrustedSiteAuthorities([trust('synthetic-upgrade')]);
      const repo=new SiteIdentityBindings(isolated,'synthetic-upgrade',()=>config);
      const row=await isolated.transaction('synthetic-upgrade','old-user',tx=>repo.recordVerifiedLinkIn(tx,principal,proof));
      await isolated.transaction('synthetic-upgrade','old-user',tx=>repo.revokeIn(tx,row.id,1));
      // Rehearse rollback of runtime/migration, retaining additive storage and audit.
      await isolated.migrate(baseline);
      expect((await isolated.query("SELECT status,version FROM site_identity_bindings WHERE company_id='synthetic-upgrade'")).rows).toEqual([{status:'REVOKED',version:2}]);
      expect((await isolated.query("SELECT count(*)::int AS n FROM audit_log WHERE action LIKE 'SITE_IDENTITY_LINK_%'")).rows[0].n).toBe(2);
      expect((await isolated.query("SELECT data->>'email' AS email FROM aggregates WHERE company_id='synthetic-upgrade' AND kind='user' AND id='old-user'")).rows[0].email).toBe('equal@example.test');
      await expect(repo.resolve(principal)).rejects.toMatchObject({code:'ACCESS_DENIED'});
    } finally { await isolated.close(); await db.query('DROP SCHEMA '+schema+' CASCADE'); }
  });
});
