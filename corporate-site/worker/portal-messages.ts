import type { PortalConversation, PortalConversationRecipient, PortalMessage, PortalSession } from '../src/lib/portal-contract';
import type { D1Database, WorkerEnv } from './types';

type Row = Record<string, unknown>;
type Guard = { sql: string; values: unknown[] };
interface Helpers {
  fail(status: number, code: string, message: string): never;
  response(body: unknown, status?: number): Response;
  readBody(request: Request, maxBytes?: number): Promise<Row>;
  rateLimit(db: D1Database, key: string, limit: number, seconds?: number): Promise<void>;
  sha(value: string): Promise<string>;
}
const participantRoles = ['client', 'partner', 'worker'];
const allowedRoles = [...participantRoles, 'bauleiter', 'owner', 'admin'];
const keyPattern = /^[a-zA-Z0-9_-]{16,100}$/;
const recordPattern = /^[a-zA-Z0-9_-]{1,200}$/;
const manager = (s: PortalSession) => s.role === 'owner' || s.role === 'admin' || s.role === 'bauleiter';
const scopedManager = (s: PortalSession) => s.role === 'bauleiter';

/** The predicate is applied to each read and inside the transaction that writes. */
function actorGuard(s: PortalSession): Guard {
  return s.role === 'owner' ? {sql: '1=1', values: []} : {
    sql: "EXISTS (SELECT 1 FROM profiles actor WHERE actor.id=? AND lower(actor.email)=? AND actor.role=? AND actor.status='approved')",
    values: [s.user!.id, s.user!.email.trim().toLowerCase(), s.role],
  };
}
function requestGuard(alias: string): string {
  return `(${alias}.request_id IS NULL OR EXISTS (SELECT 1 FROM cleaning_requests job WHERE job.id=${alias}.request_id AND
    ((${alias}.participant_role IN ('client','partner') AND job.client_id=${alias}.participant_id) OR
     (${alias}.participant_role='worker' AND job.assigned_worker_id=${alias}.participant_id AND job.status IN ('scheduled','in_progress','completed')))))`;
}
function conversationGuard(s: PortalSession, alias = 'c'): Guard {
  const actor = actorGuard(s);
  return {
    sql: `${actor.sql} AND EXISTS (SELECT 1 FROM profiles member WHERE member.id=${alias}.participant_id
      AND member.role=${alias}.participant_role AND member.status='approved') AND ${requestGuard(alias)}` +
      (scopedManager(s) ? ` AND EXISTS (SELECT 1 FROM cleaning_requests scope_job WHERE scope_job.id=${alias}.request_id AND scope_job.assigned_bauleiter_id=?)` : '') +
      (manager(s) ? '' : ` AND ${alias}.participant_id=? AND ${alias}.participant_role=?`),
    values: [...actor.values, ...(scopedManager(s) ? [s.user!.id] : []), ...(manager(s) ? [] : [s.user!.id, s.role])],
  };
}
function participantContext(s: PortalSession, requestId: string | null): Guard {
  return requestId ? {
    sql: ` AND EXISTS (SELECT 1 FROM cleaning_requests job WHERE job.id=? AND
      ((member.role IN ('client','partner') AND job.client_id=member.id) OR
       (member.role='worker' AND job.assigned_worker_id=member.id AND job.status IN ('scheduled','in_progress','completed')))
      ${scopedManager(s) ? 'AND job.assigned_bauleiter_id=?' : ''})`,
    values: [requestId, ...(scopedManager(s) ? [s.user!.id] : [])],
  } : {sql:'',values:[]};
}
async function scopedRecipients(db: D1Database, s: PortalSession): Promise<{recipients:PortalConversationRecipient[];limited:boolean}> {
  if (!scopedManager(s)) return {recipients:[],limited:false};
  const actor = actorGuard(s);
  const rows = (await db.prepare(`SELECT member.id,member.name,member.role,job.id AS request_id
    FROM cleaning_requests job JOIN profiles member ON
      ((member.role IN ('client','partner') AND job.client_id=member.id) OR
       (member.role='worker' AND job.assigned_worker_id=member.id AND job.status IN ('scheduled','in_progress','completed')))
    WHERE job.assigned_bauleiter_id=? AND member.status='approved' AND ${actor.sql}
    ORDER BY job.updated_at DESC,job.id,member.id LIMIT 401`)
    .bind(s.user!.id,...actor.values).all<Row>()).results || [];
  return {recipients:rows.slice(0,400).map(row => ({
    participantId:String(row.id),participantName:String(row.name),
    participantRole:row.role as PortalConversationRecipient['participantRole'],requestId:String(row.request_id),
  })),limited:rows.length>400};
}
const conversationColumns = `c.*, p.name AS participant_name,
  COALESCE((SELECT substr(m.body,1,160) FROM portal_messages m WHERE m.conversation_id=c.id ORDER BY m.sequence DESC LIMIT 1),'') AS last_message_preview`;
const fromConversations = 'portal_conversations c JOIN profiles p ON p.id=c.participant_id';
function viewConversation(row: Row): PortalConversation {
  return {
    id: String(row.id), participantId: String(row.participant_id), participantName: String(row.participant_name),
    participantRole: row.participant_role as PortalConversation['participantRole'], requestId: row.request_id as string | null,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), lastMessagePreview: String(row.last_message_preview || ''),
  };
}
function viewMessage(row: Row): PortalMessage {
  return {
    id: String(row.id), sequence: Number(row.sequence), conversationId: String(row.conversation_id), authorId: String(row.author_id),
    authorName: String(row.author_name), authorRole: row.author_role as PortalMessage['authorRole'], body: String(row.body), createdAt: String(row.created_at),
  };
}
async function visibleConversation(db: D1Database, s: PortalSession, threadId: string) {
  const guard = conversationGuard(s);
  return db.prepare(`SELECT ${conversationColumns} FROM ${fromConversations} WHERE c.id=? AND ${guard.sql}`)
    .bind(threadId, ...guard.values).first<Row>();
}
function onlyKeys(body: Row, allowed: string[], h: Helpers) {
  if (Object.keys(body).some(key => !allowed.includes(key))) h.fail(422, 'unknown_field', 'Die Anfrage enthält ein nicht erlaubtes Feld.');
}
function identifier(value: unknown, h: Helpers): string {
  if (typeof value !== 'string' || !recordPattern.test(value)) h.fail(422, 'validation', 'Die Kennung ist ungültig.');
  return value as string;
}

export async function handlePortalMessages(request: Request, env: WorkerEnv, s: PortalSession, h: Helpers): Promise<Response> {
  if (!s.user) h.fail(401, 'unauthenticated', 'Bitte melden Sie sich an.');
  if (!allowedRoles.includes(s.role)) h.fail(403, 'forbidden', 'Für Nachrichten ist eine aktive Freigabe erforderlich.');
  if (!env.DB) h.fail(503, 'unavailable', 'Nachrichten sind derzeit nicht verfügbar.');
  const db = env.DB!;
  const url = new URL(request.url), path = url.pathname.replace(/\/$/, '');
  if (path === '/api/portal/conversations/recipients') {
    if (request.method !== 'GET') return h.response({error:{code:'method',message:'Methode nicht erlaubt.'}},405);
    if (!manager(s)) h.fail(403,'forbidden','Die Gesprächsauswahl ist nur für die Verwaltung verfügbar.');
    const query=(url.searchParams.get('q')||'').trim(), after=url.searchParams.get('after');
    if(query.length>160 || /[\u0000-\u001f\u007f]/.test(query))h.fail(422,'validation','Der Suchbegriff ist ungültig.');
    if(after!==null)identifier(after,h);
    const rawRequest=url.searchParams.get('requestId');
    const requestId=rawRequest===null?null:identifier(rawRequest,h);
    // A site manager never receives a company-wide contact directory.
    if(scopedManager(s)&&!requestId)return h.response({recipients:[],nextAfter:null});
    const actor=actorGuard(s),context=participantContext(s,requestId);
    const pattern='%'+query.replace(/[\\%_]/g,'\\$&')+'%';
    const rows=(await db.prepare(`SELECT member.id,member.name,member.role FROM profiles member
      WHERE member.status='approved' AND member.role IN ('client','partner','worker') AND ${actor.sql}${context.sql}
      ${query?" AND member.name LIKE ? ESCAPE '\\'":''}${after===null?'':' AND member.id>?'}
      ORDER BY member.id ASC LIMIT 51`).bind(...actor.values,...context.values,...(query?[pattern]:[]),...(after===null?[]:[after])).all<Row>()).results||[];
    const page=rows.slice(0,50);
    return h.response({recipients:page.map(row=>({id:String(row.id),name:String(row.name),role:String(row.role)})),
      nextAfter:rows.length>50?String(page[page.length-1].id):null});
  }
  if (path === '/api/portal/conversations') {
    if (request.method === 'GET') {
      const guard = conversationGuard(s);
      const rawCursor=url.searchParams.get('cursor');
      let cursor: string[] | null=null;
      if(rawCursor!==null){
        try{
          if(rawCursor.length>500)throw Error('cursor');
          const value:unknown=JSON.parse(rawCursor);
          if(!Array.isArray(value)||value.length!==2||typeof value[0]!=='string'||typeof value[1]!=='string'||
            !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value[0])||!Number.isFinite(Date.parse(value[0]))||!recordPattern.test(value[1]))throw Error('cursor');
          cursor=value;
        }catch{h.fail(422,'cursor','Die Gesprächsposition ist ungültig.');}
      }
      const rows = (await db.prepare(`SELECT ${conversationColumns} FROM ${fromConversations} WHERE ${guard.sql}
        ${cursor?' AND (c.updated_at<? OR (c.updated_at=? AND c.id<?))':''}
        ORDER BY c.updated_at DESC,c.id DESC LIMIT 201`).bind(...guard.values,...(cursor?[cursor[0],cursor[0],cursor[1]]:[])).all<Row>()).results || [];
      const choices = await scopedRecipients(db,s);
      return h.response({conversations: rows.slice(0, 200).map(viewConversation), limited: rows.length > 200 || choices.limited, recipients:choices.recipients,
        nextCursor:rows.length>200?JSON.stringify([rows[199].updated_at,rows[199].id]):null});
    }
    if (request.method !== 'POST') return h.response({error:{code:'method',message:'Methode nicht erlaubt.'}}, 405);
    const body = await h.readBody(request, 2048);
    onlyKeys(body, manager(s) ? ['participantId','requestId'] : ['requestId'], h);
    const participantId = manager(s) ? identifier(body.participantId, h) : s.user!.id;
    const requestId = body.requestId == null ? null : identifier(body.requestId, h);
    if (scopedManager(s) && !requestId) h.fail(422,'request_required','Bitte wählen Sie einen Ihnen zugeteilten Auftrag.');
    const actor = actorGuard(s), context = participantContext(s,requestId);
    const participant = await db.prepare(`SELECT member.id,member.name,member.role,member.status FROM profiles member
      WHERE member.id=? AND member.status='approved' AND member.role IN ('client','partner','worker') AND ${actor.sql}${context.sql}`)
      .bind(participantId,...actor.values,...context.values).first<Row>();
    if (!participant) h.fail(404, 'not_found', 'Die Gesprächsperson ist nicht verfügbar.');
    const role = String(participant!.role), scope = requestId ? `request:${requestId}` : 'direct';
    const guard = conversationGuard(s);
    const existing = await db.prepare(`SELECT ${conversationColumns} FROM ${fromConversations}
      WHERE c.participant_id=? AND c.participant_role=? AND c.scope_key=? AND ${guard.sql}`)
      .bind(participantId, role, scope, ...guard.values).first<Row>();
    if (existing) return h.response({conversation:viewConversation(existing)});
    await h.rateLimit(db, `conversation:${await h.sha(s.user!.id)}`, 30);
    const threadId = crypto.randomUUID(), now = new Date().toISOString();
    const created = await db.batch([
      db.prepare(`INSERT INTO portal_conversations (id,participant_id,participant_role,request_id,scope_key,created_at,updated_at)
        SELECT ?,member.id,member.role,?,?,?,? FROM profiles member
        WHERE member.id=? AND member.role=? AND member.status='approved' AND ${actor.sql}${context.sql}
        ON CONFLICT(participant_id,participant_role,scope_key) DO NOTHING`)
        .bind(threadId, requestId, scope, now, now, participantId, role, ...actor.values, ...context.values),
      db.prepare("INSERT INTO portal_audit (id,actor_id,action,entity_id,created_at) SELECT ?,?,'conversation.created',?,? WHERE EXISTS (SELECT 1 FROM portal_conversations WHERE id=?)")
        .bind(crypto.randomUUID(), s.user!.id, threadId, now, threadId),
    ]);
    const stored = await db.prepare(`SELECT ${conversationColumns} FROM ${fromConversations}
      WHERE c.participant_id=? AND c.participant_role=? AND c.scope_key=? AND ${guard.sql}`)
      .bind(participantId, role, scope, ...guard.values).first<Row>();
    if (!stored) h.fail(404, 'not_found', 'Das Gespräch oder die Freigabe ist nicht verfügbar.');
    return h.response({conversation:viewConversation(stored!)}, created[0]?.meta?.changes ? 201 : 200);
  }
  const match = path.match(/^\/api\/portal\/conversations\/([a-zA-Z0-9_-]{1,100})\/messages$/);
  if (!match) return h.response({error:{code:'not_found',message:'Dieser Endpunkt ist nicht verfügbar.'}}, 404);
  const threadId = match[1];
  const thread = await visibleConversation(db, s, threadId);
  if (!thread) h.fail(404, 'not_found', 'Das Gespräch ist nicht verfügbar.');
  const guard = conversationGuard(s);
  if (request.method === 'GET') {
    const rawBefore = url.searchParams.get('before');
    const before = rawBefore === null ? null : Number(rawBefore);
    if (rawBefore !== null && (!/^[1-9][0-9]{0,15}$/.test(rawBefore) || !Number.isSafeInteger(before)))
      h.fail(422, 'cursor', 'Die Nachrichtenposition ist ungültig.');
    const rows = (await db.prepare(`SELECT m.* FROM portal_messages m JOIN portal_conversations c ON c.id=m.conversation_id
      WHERE m.conversation_id=? AND ${guard.sql}${before === null ? '' : ' AND m.sequence<?'} ORDER BY m.sequence DESC LIMIT 51`)
      .bind(threadId, ...guard.values, ...(before === null ? [] : [before])).all<Row>()).results || [];
    const page = rows.slice(0, 50).reverse();
    return h.response({conversation:viewConversation(thread!), messages:page.map(viewMessage), nextBefore:rows.length > 50 ? Number(page[0].sequence) : null});
  }
  if (request.method !== 'POST') return h.response({error:{code:'method',message:'Methode nicht erlaubt.'}}, 405);
  const body = await h.readBody(request, 12_288);
  onlyKeys(body, ['body','idempotencyKey'], h);
  if (typeof body.body !== 'string' || body.body.length > 2000 || !body.body.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body.body))
    h.fail(422, 'validation', 'Bitte schreiben Sie eine Nachricht mit höchstens 2000 Zeichen.');
  if (typeof body.idempotencyKey !== 'string' || !keyPattern.test(body.idempotencyKey)) h.fail(422, 'idempotency', 'Die Nachrichtenkennung ist ungültig.');
  const content = (body.body as string).trim(), key = body.idempotencyKey as string;
  const payloadHash = await h.sha(content);
  const previousMessage = () => db.prepare(`SELECT m.* FROM portal_messages m JOIN portal_conversations c ON c.id=m.conversation_id
    WHERE m.conversation_id=? AND m.author_id=? AND m.idempotency_key=? AND ${guard.sql}`)
    .bind(threadId, s.user!.id, key, ...guard.values).first<Row>();
  const previous = await previousMessage();
  if (previous) {
    if (previous.payload_hash !== payloadHash) h.fail(409, 'idempotency_conflict', 'Diese Nachrichtenkennung wurde bereits für einen anderen Text verwendet.');
    return h.response({message:viewMessage(previous)});
  }
  await h.rateLimit(db, `messages:${await h.sha(s.user!.id)}`, 120, 300);
  const messageId = crypto.randomUUID(), now = new Date().toISOString();
  const name = s.profile?.name || (manager(s) ? 'KNABA' : 'Mitglied');
  const results = await db.batch([
    db.prepare(`INSERT INTO portal_messages (id,conversation_id,author_id,author_name,author_role,body,idempotency_key,payload_hash,created_at)
      SELECT ?,c.id,?,?,?,?,?,?,? FROM portal_conversations c WHERE c.id=? AND ${guard.sql}
      ON CONFLICT(conversation_id,author_id,idempotency_key) DO NOTHING`)
      .bind(messageId,s.user!.id,name,s.role,content,key,payloadHash,now,threadId,...guard.values),
    db.prepare('UPDATE portal_conversations SET updated_at=? WHERE id=? AND EXISTS (SELECT 1 FROM portal_messages WHERE id=?)')
      .bind(now,threadId,messageId),
    db.prepare("INSERT INTO portal_audit (id,actor_id,action,entity_id,created_at) SELECT ?,?,'conversation.message_sent',?,? WHERE EXISTS (SELECT 1 FROM portal_messages WHERE id=?)")
      .bind(crypto.randomUUID(),s.user!.id,threadId,now,messageId),
  ]);
  const stored = await previousMessage();
  if (!stored) h.fail(403, 'forbidden', 'Die Gesprächsfreigabe wurde geändert. Bitte aktualisieren Sie die Ansicht.');
  if (stored!.payload_hash !== payloadHash) h.fail(409, 'idempotency_conflict', 'Diese Nachrichtenkennung wurde bereits für einen anderen Text verwendet.');
  return h.response({message:viewMessage(stored!)}, results[0]?.meta?.changes ? 201 : 200);
}
