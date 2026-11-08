import {readFileSync} from 'node:fs';
import {INBOX_LOCALES,type InboxLocale,type InboxLabels} from '../../src/lib/assistant-inbox-i18n';

/** Test-only fixture. Complete dictionaries must never enter the client module graph. */
export const inboxPacks=Object.fromEntries(INBOX_LOCALES.map(locale=>[
  locale,JSON.parse(readFileSync(new URL(`../../src/data/assistant-inbox-locales/inbox-${locale}.json`,import.meta.url),'utf8')),
])) as Record<InboxLocale,InboxLabels>;
