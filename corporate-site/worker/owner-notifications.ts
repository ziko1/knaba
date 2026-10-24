import type { D1Database, D1Statement } from './types';

/** A committed visitor event may enqueue one record, never a plaintext message or bearer code. */
export type OwnerNoticeKind='new_thread'|'visitor_message';
export function enqueueOwnerNotice(
  db:D1Database,threadId:string,messageId:string,mutation:string,kind:OwnerNoticeKind,at:string
):D1Statement {
  return db.prepare(
    'INSERT INTO assistant_owner_notifications ' +
      '(id,thread_id,message_id,kind,status,attempts,next_attempt_at,last_error,provider_message_id,created_at,updated_at,sent_at) ' +
      "SELECT ?,m.thread_id,m.id,?,'pending',0,0,'',NULL,?,?,NULL FROM assistant_messages m " +
      'WHERE m.thread_id=? AND m.id=? AND m.last_mutation=? ' +
      'ON CONFLICT(message_id) DO NOTHING'
  ).bind(crypto.randomUUID(),kind,at,at,threadId,messageId,mutation);
}

/** Owner-only caller must verify role before reading this output. No notifications leave the platform. */
export async function ownerNotificationStatus(db:D1Database) {
  const rows=(await db.prepare(
    'SELECT thread_id,kind,status,attempts,created_at,sent_at FROM assistant_owner_notifications ' +
    'ORDER BY created_at DESC,id DESC LIMIT 26'
  ).all<Record<string,unknown>>()).results||[];
  return {
    notifications:rows.slice(0,25).map(row=>({
      threadId:String(row.thread_id),kind:String(row.kind),
      status:String(row.status),attempts:Number(row.attempts),
      createdAt:String(row.created_at),sentAt:row.sent_at==null?null:String(row.sent_at)
    })),
    limited:rows.length>25,
    // Deliberate: provider credentials, quota, retention approval and real owner consent NOT checked.
    disabled:true
  };
}
