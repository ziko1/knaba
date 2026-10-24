import { restoreConversation, type ConversationIdentity } from './assistant-conversation';

/**
 * Versioned, manually transferable *bearer* credential for the existing D1 guest thread.
 * Never place it in a URL, analytics event, external message, or persistent browser storage.
 * KNABA2 differs deliberately from the historic KNABA1 hexadecimal-token experiment.
 */
const FORMAT = /^KNABA2:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):([a-zA-Z0-9_-]{43})$/i;

export function parseRecoveryCode(raw: unknown): ConversationIdentity | null {
  if (typeof raw !== 'string' || raw.length > 100) return null;
  const match = raw.trim().match(FORMAT);
  if (!match) return null;
  // Centralized validation, no token case conversion (base64url is case-sensitive).
  return restoreConversation(JSON.stringify({ id: match[1].toLowerCase(), capability: match[2] }));
}

export function formatRecoveryCode(identity: ConversationIdentity): string {
  const valid = restoreConversation(JSON.stringify(identity));
  if (!valid) throw new TypeError('Invalid private conversation identity');
  return `KNABA2:${valid.id.toLowerCase()}:${valid.capability}`;
}
