import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Actor} from './api';
import {partnerRoute, readPartnerOrders} from './PartnerOrders';
import {languages, translator} from '../../../packages/i18n/index';

const actor = (roles: string[], permissions: string[]): Actor => ({
  roles, permissions, userId: 'fixture', companyId: 'tenant', siteIds: [], customerIds: [], warehouseIds: [],
});
const row = {id: 'Grün/&', status: 'SCHEDULED', updatedAt: '2026-11-25T00:00:00.000Z'};
const signal = new AbortController().signal;
const fixture = (json: unknown) => {
  const fetch = vi.fn(async () => Response.json(json));
  vi.stubGlobal('fetch', fetch);
  return fetch;
};
afterEach(() => vi.unstubAllGlobals());

describe('web partner entry and scoped reads', () => {
  it('isolates exact partners from the general console and preserves normal staff entry', () => {
    expect(partnerRoute(actor(['PARTNER'], ['partner.orders.read']))).toBe('orders');
    expect(partnerRoute(actor(['EMPLOYEE'], ['tasks.read']))).toBe('staff');
    for (const roles of [['PARTNER', 'DIRECTOR'], ['partner'], ['\u0085PARTNER\u0085'], []])
      expect(partnerRoute(actor(roles, ['partner.orders.read']))).toBe('denied');
    expect(partnerRoute(actor(['PARTNER'], ['*','customer.portal']))).toBe('denied');
  });
  it('uses a scoped, uncached and abortable GET and preserves opaque page cursors', async () => {
    const fetch = fixture({items: [row], nextAfter: row.id});
    expect(await readPartnerOrders({after: 'previous/+ #'}, signal)).toEqual({kind: 'list', page: {items: [row], nextAfter: row.id}});
    expect(fetch).toHaveBeenCalledWith('/api/v1/partner/orders?limit=50&after=previous%2F%2B+%23',
      expect.objectContaining({cache: 'no-store', credentials: 'same-origin', signal}));
  });
  it.each([['.', 'order?id=.'], ['..','order?id=..'], ['Grün/&','orders/Gr%C3%BCn%2F%26']])(
    'reads the exact detail for %s', async (id, suffix) => {
      const item = {...row, id}, fetch = fixture(item);
      expect(await readPartnerOrders({id}, signal)).toEqual({kind: 'order', order: item});
      expect(fetch).toHaveBeenCalledWith('/api/v1/partner/' + suffix, expect.anything());
    });
  it('drops mismatched details, undeclared fields and unusable cursors', async () => {
    fixture(row);
    await expect(readPartnerOrders({id: 'different'}, signal)).rejects.toThrow();
    for (const bad of [
      {items: [row, row], nextAfter: null}, {items: [row], nextAfter: 'other'},
      {items: [{...row, internalNote: 'omitted'}], nextAfter: null}, {items: [{...row, updatedAt: 'bad'}], nextAfter: null},
    ]) {
      fixture(bad);
      await expect(readPartnerOrders({}, signal)).rejects.toThrow();
    }
  });
  it('covers partner-specific controls, error and order states in all six ERP languages', () => {
    for (const lang of languages) for (const key of ['LogoutFailed','Orders','First','Next','Unavailable','Pending','Confirmed','Scheduled','Submitted','Review','Closed','Paused'])
      expect(translator(lang)('partner' + key)).not.toBe('partner' + key);
  });
});
