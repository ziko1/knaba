import {timingSafeEqual} from 'node:crypto';

export type TelegramErrorCode = 'ACCESS_DENIED'|'MISSING_CONFIGURATION'|'VALIDATION_ERROR'|'PROVIDER_DISABLED'|'PROVIDER_UNAVAILABLE'|'PROVIDER_OUTCOME_UNKNOWN';
export class TelegramBoundaryError extends Error {
  readonly code: TelegramErrorCode;
  constructor(code: TelegramErrorCode) { super(code); this.name = 'TelegramBoundaryError'; this.code = code; }
}
const fail = (code: TelegramErrorCode): never => { throw new TelegramBoundaryError(code); };
const object = (x: unknown): Record<string, unknown> | null => x !== null && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : null;
const safeId = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x > 0;
const validText = (x: unknown, max = 4096): x is string => typeof x === 'string' && x.length > 0 && x.length <= max;
const validFileId = (x: unknown): x is string => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,512}$/.test(x);

/** Telegram has a shared webhook secret header, not a signed request body. HTTPS and secret protection are mandatory. */
export function verifyTelegramWebhookSecret(header: unknown, configured: string | undefined): true {
  if (typeof configured !== 'string' || !/^[A-Za-z0-9_-]{16,256}$/.test(configured)) return fail('MISSING_CONFIGURATION');
  if (typeof header !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(header)) return fail('ACCESS_DENIED');
  const actual = Buffer.from(header), expected = Buffer.from(configured);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return fail('ACCESS_DENIED');
  return true;
}

export type TelegramInbound = {
  kind: 'MESSAGE'; id: string; update_id: number; sender: string; chat_id: string;
  received_at: string; type: 'text'|'voice'|'photo'|'document'|'callback'|'other';
  text?: string; action_id?: string; reply_to_message_id?: string;
  media?: {kind: 'voice'|'photo'|'document'; file_id: string};
};

/** Only 1:1 private updates enter KNABA. Group, channels and service updates are ignored, never authorized. */
export function parseTelegramUpdate(raw: unknown): TelegramInbound | null {
  const update = object(raw);
  if (!update || !safeId(update.update_id)) return fail('VALIDATION_ERROR');
  const message = object(update.message), callback = object(update.callback_query);
  if (!message && !callback) return null;
  const source = callback ? object(callback.message) : message;
  const from = object(callback ? callback.from : message?.from), chat = object(source?.chat);
  if (!chat || chat.type !== 'private') return null;
  if (!from || from.is_bot === true || !safeId(from.id) || !safeId(chat.id) || chat.id !== from.id) return fail('ACCESS_DENIED');
  const time = source?.date;
  if (callback && time === 0) return null;
  if (typeof time !== 'number' || !Number.isSafeInteger(time) || time < 1 || time > 8640000000000 / 1000) return fail('VALIDATION_ERROR');
  const event: TelegramInbound = {kind: 'MESSAGE', id: `TELEGRAM:${update.update_id}`, update_id: update.update_id, sender: String(from.id), chat_id: String(chat.id), received_at: new Date(time * 1000).toISOString(), type: 'other'};
  if (callback) {
    if (!validText(callback.data, 64) || Buffer.byteLength(callback.data,'utf8') > 64) return null;
    event.type = 'callback'; event.action_id = callback.data;
    return event;
  }
  const reply = object(message?.reply_to_message);
  if (reply && safeId(reply.message_id)) event.reply_to_message_id = String(reply.message_id);
  if (message?.text !== undefined) {
    if (!validText(message.text)) return fail('VALIDATION_ERROR');
    event.type = 'text'; event.text = message.text;
    return event;
  }
  for (const kind of ['voice', 'document'] as const) {
    const media = object(message?.[kind]);
    if (media) {
      if (!validFileId(media.file_id)) return fail('VALIDATION_ERROR');
      event.type = kind; event.media = {kind, file_id: media.file_id};
      return event;
    }
  }
  const photos = message?.photo;
  if (Array.isArray(photos) && photos.length) {
    const last = object(photos[photos.length - 1]);
    if (!validFileId(last?.file_id)) return fail('VALIDATION_ERROR');
    event.type = 'photo'; event.media = {kind: 'photo', file_id: last.file_id};
  }
  return event;
}

export interface TelegramSendPolicy {consent: boolean; verifiedPrivateRecipient: boolean; optedOut?: boolean}
export interface TelegramSenderConfig { token: string; enabled: boolean; allowedChatIds: readonly string[]; timeoutMs?: number }
/** Outbound is disabled unless the caller explicitly configures an authorized provider AND a permitted recipient. */
export class TelegramBotAdapter {
  private readonly config: TelegramSenderConfig;
  private readonly request: typeof fetch;
  constructor(config: TelegramSenderConfig, request: typeof fetch = fetch) {
    this.config=config; this.request=request;
    if (typeof config.token !== 'string' || !/^\d+:[A-Za-z0-9_-]{20,}$/.test(config.token) ||
      !Array.isArray(config.allowedChatIds) || !Number.isSafeInteger(config.timeoutMs ?? 15000) || (config.timeoutMs ?? 15000) < 1000 || (config.timeoutMs ?? 15000) > 30000)
      fail('MISSING_CONFIGURATION');
  }
  async sendText(chatId: string, text: string, policy: TelegramSendPolicy): Promise<{provider_message_id: string; status: 'API_ACCEPTED'}> {
    if (!this.config.enabled) return fail('PROVIDER_DISABLED');
    if (!policy.consent || !policy.verifiedPrivateRecipient || policy.optedOut || !this.config.allowedChatIds.includes(chatId)) return fail('ACCESS_DENIED');
    if (!/^[1-9]\d{0,15}$/.test(chatId) || !validText(text)) return fail('VALIDATION_ERROR');
    let response: Response;
    try {
      response = await this.request(`https://api.telegram.org/bot${this.config.token}/sendMessage`, {
        method: 'POST', redirect: 'error', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({chat_id: chatId, text, disable_web_page_preview: true}), signal: AbortSignal.timeout(this.config.timeoutMs ?? 15000)
      });
    } catch { return fail('PROVIDER_OUTCOME_UNKNOWN'); }
    let payload: unknown;
    try { payload = await response.json(); } catch { return fail('PROVIDER_OUTCOME_UNKNOWN'); }
    const body = object(payload), result = object(body?.result), chat = object(result?.chat);
    if (!response.ok || body?.ok !== true) return fail(body?.ok === false ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_OUTCOME_UNKNOWN');
    if (!safeId(result?.message_id) || !safeId(chat?.id) || String(chat.id) !== chatId) return fail('PROVIDER_OUTCOME_UNKNOWN');
    return {provider_message_id: String(result.message_id), status: 'API_ACCEPTED'};
  }
}
