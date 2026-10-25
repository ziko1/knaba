import { describe, expect, it } from 'vitest';
import { routeAssistantQuestion } from '../src/lib/assistant-routing';

describe('KNABA public dispatcher: roles are routing hints, never authentication', () => {
  it.each([
    ['de', 'Ich bin Mitarbeiter und möchte Arbeitsstunden melden', 'worker', '/portal/'],
    ['en', 'I am an existing customer, need to review my invoice', 'existing_client', '/portal/'],
    ['ru', 'Я работник, хочу отправить отчёт с объекта', 'worker', '/portal/'],
    ['de', 'Ich möchte mit dem Geschäftsführer sprechen', 'human', '#knaba-owner-chat'],
    ['en', 'I want a construction cleaning quote', 'new_client', '/en/kontakt/'],
    ['ru', 'Нужна цена бурения отверстий в бетоне', 'new_client', '/ru/kontakt/'],
    ['en', 'I am a subcontractor offering partnership', 'partner', '/en/kontakt/'],
  ] as const)('routes %s "%s" to %s', (locale, message, intent, href) => {
    const routed = routeAssistantQuestion(message, locale);
    expect(routed?.intent).toBe(intent);
    expect(routed?.answer.links[0].href).toBe(href);
  });

  it('directs immediate physical danger to human/emergency help, never creates an order', () => {
    const routed = routeAssistantQuestion('Gefahr auf der Baustelle, ein Arbeiter ist verletzt', 'de');
    expect(routed?.intent).toBe('safety');
    expect(routed?.answer.text).toContain('112');
    expect(routed?.answer.links[0].href).toBe('tel:112');
  });
  it('leaves unknown FAQ and malformed inputs to existing safe knowledge path', () => {
    expect(routeAssistantQuestion('Welche Regionen?', 'de')).toBeNull();
    expect(routeAssistantQuestion('  ', 'ru')).toBeNull();
    expect(routeAssistantQuestion('a'.repeat(501), 'en')).toBeNull();
  });
  it('does not echo arbitrary user input or emit external/tenant URLs', () => {
    const routed = routeAssistantQuestion('Я работник <script>alert(1)</script>', 'ru');
    expect(JSON.stringify(routed)).not.toContain('<script>');
    expect(routed?.answer.links.every(link => link.href.startsWith('/') || link.href.startsWith('#') || link.href.startsWith('tel:'))).toBe(true);
  });
});

describe('human handoff remains explicitly opted in', () => {
  it('never claims to have connected the owner or submitted a message', () => {
    for (const locale of ['de', 'en', 'ru'] as const) {
      const routed = routeAssistantQuestion('connect me to the owner / mit Inhaber sprechen / свяжите с владельцем', locale);
      expect(routed?.intent).toBe('human');
      expect(routed?.answer.links[0].href).toBe('#knaba-owner-chat');
    }
  });
});
