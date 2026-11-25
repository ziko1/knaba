import {expect, test, type Page} from '@playwright/test';

test.use({serviceWorkers: 'block'});

const order = (id: string) => ({id, status: 'SCHEDULED', updatedAt: '2026-11-25T05:00:00.000Z'});
async function partnerBackend(page: Page, roles = ['PARTNER'], permissions = ['partner.orders.read']) {
  const session = {actor: {roles, permissions, userId: 'partner', companyId: 'tenant',
    siteIds: [], customerIds: [], warehouseIds: []}, csrfToken: 'synthetic', mode: 'TEST', user: {}};
  let signedIn = false;
  let revoked = false;
  let logoutStatus = 200;
  const unexpected: string[] = [], reads: string[] = [];
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname.slice('/api/v1/'.length);
    if (path === 'public/config') return route.fulfill({json: {mode: 'TEST'}});
    if (path === 'me') return route.fulfill({status: signedIn ? 200 : 401, json: signedIn ? session : {code: 'NEEDS_REAUTH'}});
    if (path === 'auth/login') { signedIn = true; return route.fulfill({json: session}); }
    if (path === 'auth/logout') {
      if (logoutStatus !== 200) return route.fulfill({status: logoutStatus, json: {code: 'UNAVAILABLE'}});
      signedIn = false;
      return route.fulfill({json: {ok: true}});
    }
    if (path.startsWith('partner/')) {
      reads.push(path + url.search);
      if (revoked) return route.fulfill({status: 401, json: {code: 'NEEDS_REAUTH'}});
      if (path === 'partner/orders') {
        const next = url.searchParams.get('after');
        return route.fulfill({json: {items: [order(next ? '..' : 'Order A')], nextAfter: next ? null : 'Order A'}});
      }
      if (path === 'partner/order' && url.searchParams.get('id') === '..') return route.fulfill({json: order('..')});
    }
    unexpected.push(path);
    return route.fulfill({status: 403, json: {code: 'ACCESS_DENIED'}});
  });
  await page.goto('/login?language=EN');
  await page.getByRole('textbox', {name: 'Email'}).fill('partner@example.test');
  await page.getByLabel('Password', {exact: true}).fill('synthetic-test');
  await page.getByRole('button', {name: 'Sign in', exact: true}).click();
  return {reads, unexpected, revoke() { revoked = true; }, logoutResponds(status: number) { logoutStatus = status; }};
}

test('partner password entry, pagination, detail and revoked refresh use only scoped routes', async ({page}) => {
  await page.setViewportSize({width: 320, height: 700});
  const backend = await partnerBackend(page);
  await expect(page.getByRole('heading', {name: 'My orders'})).toBeVisible();
  await expect(page.getByRole('button', {name: /Order A/})).toBeVisible();
  await page.getByRole('button', {name: 'Next page'}).click();
  await page.getByRole('button', {name: /\.\./}).click();
  await expect(page.getByRole('heading', {name: '..', exact: true})).toBeVisible();
  await expect(page.getByText('Scheduled', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Back'}).click();
  await expect(page.getByRole('button', {name: /\.\./})).toBeVisible();
  expect(backend.reads.at(-1)).toBe('partner/orders?limit=50&after=Order+A');
  await page.getByLabel('Language').selectOption('UK');
  await expect(page.getByRole('heading', {name: 'Мої замовлення'})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  backend.revoke();
  await page.getByRole('button', {name: 'Оновити'}).click();
  await expect(page.getByLabel('Пароль', {exact: true})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Мої замовлення'})).toHaveCount(0);
  expect(backend.unexpected).toEqual([]);
});

for (const [name, roles, permissions] of [
  ['wildcard', ['PARTNER'], ['*']], ['mixed roles', ['PARTNER','DIRECTOR'], ['partner.orders.read']],
  ['noncanonical role', [' partner '], ['partner.orders.read']],
] as const) {
  test('partner entry denies ' + name + ' before querying a workspace', async ({page}) => {
    const backend = await partnerBackend(page, [...roles], [...permissions]);
    await expect(page.getByRole('alert')).toContainText('permission');
    await page.getByRole('button', {name: 'Sign out'}).click();
    await expect(page.getByLabel('Password', {exact: true})).toBeVisible();
    expect(backend.reads).toEqual([]);
    expect(backend.unexpected).toEqual([]);
  });
}

test('failed logout keeps orders hidden and an already-ended session can sign in again', async ({page}) => {
  const backend = await partnerBackend(page);
  await expect(page.getByRole('button', {name: /Order A/})).toBeVisible();
  const count = backend.reads.length;
  backend.logoutResponds(503);
  await page.getByRole('button', {name: 'Sign out'}).click();
  await expect(page.getByRole('alert')).toContainText('could not confirm sign-out');
  await expect(page.getByRole('button', {name: /Order A/})).toHaveCount(0);
  backend.logoutResponds(401);
  await page.getByRole('button', {name: 'Sign out'}).click();
  await expect(page.getByLabel('Password', {exact: true})).toBeVisible();
  expect(backend.reads.length).toBe(count);
  expect(backend.unexpected).toEqual([]);
});
