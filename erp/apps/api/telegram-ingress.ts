import type {Database} from './database.ts';
import {parseTelegramUpdate,TelegramBoundaryError,verifyTelegramWebhookSecret} from '../../packages/integrations/telegram.ts';

/** No network provider calls are made here. Ack means durable inbox commit, not an owner notification. */
export async function acceptTelegramWebhook(
  db: Pick<Database,'transaction'>,
  companyId: string,
  bytes: unknown,
  header: unknown,
  secret: string | undefined
): Promise<{accepted: true; ignored?: true}> {
  verifyTelegramWebhookSecret(header,secret);
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > 64*1024)
    throw new TelegramBoundaryError('VALIDATION_ERROR');
  let data: unknown;
  try { data=JSON.parse(bytes.toString('utf8')); }
  catch { throw new TelegramBoundaryError('VALIDATION_ERROR'); }
  const event = parseTelegramUpdate(data);
  if (!event) return {accepted: true,ignored: true};
  await db.transaction(companyId,'TELEGRAM_INBOX',async tx=>{
    const params=['TELEGRAM',event.id,companyId,JSON.stringify(event)];
    const insert = await tx.query('INSERT INTO webhook_inbox(provider,event_id,company_id,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT (provider,event_id) DO NOTHING RETURNING event_id',params);
    if (insert.rows.length) {
      await tx.event('telegram.inbound',{provider:'TELEGRAM',event_id:event.id});
    } else {
      const old = await tx.query('SELECT company_id, payload = $3::jsonb AS identical FROM webhook_inbox WHERE provider=$1 AND event_id=$2',[params[0],params[1],params[3]]);
      if (old.rows.length!==1 || old.rows[0]?.company_id!==companyId)
        throw new TelegramBoundaryError('ACCESS_DENIED');
      if (old.rows[0]?.identical!==true)
        throw new TelegramBoundaryError('VALIDATION_ERROR');
    }
  });
  return {accepted: true};
}
