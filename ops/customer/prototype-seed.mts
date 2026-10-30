/** Explicit isolated synthetic bootstrap. Run only through customer installer in APP_MODE=TEST. */
import { readFile, stat } from 'node:fs/promises';
import { Database } from '/app/apps/api/database.ts';
import { hashPassword } from '/app/apps/api/auth.ts';
import { seed } from '/app/infra/seed.ts';

if (process.env.APP_MODE !== 'TEST' || !/^knaba-prototype-[A-Za-z0-9_-]+$/.test(process.env.COMPANY_ID ?? ''))
  throw Error('ISOLATED_PROTOTYPE_MODE_REQUIRED');
const path = '/run/knaba-prototype-input.json';
const info = await stat(path);
if (!info.isFile() || (info.mode & 0o077) !== 0 || info.size > 4096) throw Error('PRIVATE_PROTOTYPE_INPUT_REQUIRED');
const input = JSON.parse(await readFile(path, 'utf8'));
if (input.syntheticOnly !== true || typeof input.password !== 'string' || !/^[a-f0-9]{64}$/.test(input.password))
  throw Error('EXPLICIT_SYNTHETIC_INPUT_REQUIRED');
const db = new Database();
try {
  await seed(db, process.env.COMPANY_ID);
  const passwordHash = await hashPassword(input.password);
  await db.transaction(process.env.COMPANY_ID!, 'PROTOTYPE_CREDENTIAL_ROTATION', async tx => {
    const users = await tx.list('user');
    if (!users.length || users.some(user => user.data.synthetic !== true || user.data.demo !== true))
      throw Error('PROTOTYPE_CREDENTIAL_ROTATION_REFUSES_REAL_IDENTITIES');
    for (const user of users)
      await tx.query('UPDATE auth_credentials SET password_hash=$1 WHERE company_id=$2 AND user_id=$3',
        [passwordHash, process.env.COMPANY_ID, user.id]);
    await tx.query('DELETE FROM auth_sessions WHERE company_id=$1', [process.env.COMPANY_ID]);
  });
  console.log(JSON.stringify({ status: 'SYNTHETIC_PROTOTYPE_PREPARED', randomCredentials: true, realDataAllowed: false }));
} finally {
  await db.close();
}
