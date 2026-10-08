import {test, expect, type Page, type TestInfo} from '@playwright/test';
import {zodToJsonSchema} from 'zod-to-json-schema';
import {registry} from '../apps/api/registry.ts';
import {translator, type Language} from '../packages/i18n/index.ts';

// UI-only acceptance: these tests render the actual built React application
// against explicit in-memory HTTP fixtures. They do not claim PostgreSQL,
// authentication, provider delivery, native devices or production acceptance.
// The command catalogue uses the actual domain schemas, not parallel UI forms.
const catalog = Object.entries(registry).map(([name, def]) => ({
  name, permission: def.permission, highRisk: !!def.highRisk,
  schema: zodToJsonSchema(def.schema, {$refStrategy: 'none'}),
}));
const stamp = '2026-10-08T12:30:00.000Z';
const longName = 'Synthetic Hauptgebäude · довга назва об’єкта · ' + 'Gebäudeverwaltungsbereich'.repeat(5);
const entity = (kind: string, id: string, data: Record<string, unknown> = {}) => ({
  id, kind, version: 1, createdAt: stamp, updatedAt: stamp,
  data: {name: `${kind} · ${longName}`, siteId: 'site-a', status: 'DRAFT', ...data},
});
const viewports = [
  {width: 320, height: 568}, {width: 360, height: 800},
  {width: 390, height: 844}, {width: 430, height: 932},
  {width: 600, height: 960}, {width: 768, height: 1024},
  {width: 1024, height: 768}, {width: 1280, height: 800},
  {width: 1440, height: 900}, {width: 1920, height: 1080},
  {width: 2560, height: 1440}, {width: 667, height: 375},
  {width: 844, height: 390},
];

async function fixture(page: Page, role: string | null = 'DIRECTOR') {
  const records: Record<string, ReturnType<typeof entity>[]> = {
    site: [entity('site', 'site-a', {active: true, address: longName})],
    location: Array.from({length: 9}, (_, i) => entity('location', `loc-${i}`, {
      parentId: i ? `loc-${i - 1}` : undefined, nodeType: 'ROOM', active: true, code: `R-${i}`,
    })),
    task: [entity('task', 'task-a', {title: longName, description: longName, state: 'READY'})],
    user: [entity('user', 'fixture-user', {roles: [role], siteIds: ['site-a'], active: true})],
    customer: [entity('customer', 'customer-a')],
    lead: [entity('lead', 'lead-a')], order: [entity('order', 'order-a')],
    quote: [entity('quote', 'quote-a')], service: [entity('service', 'service-a')],
    material: [entity('material', 'material-a', {active: true, sku: 'SYNTHETIC-001'})],
    stock_location: [entity('stock_location', 'warehouse-a')],
    purchase_requisition: [entity('purchase_requisition', 'purchase-a')],
    payout: [entity('payout', 'payout-a', {amountCents: 123456789})],
    report: [entity('report', 'report-a')],
    decision: [entity('decision', 'decision-a', {status: 'OPEN', reason: longName, amountCents: 123456789})],
    shift: [entity('shift', 'shift-a', {employeeId: 'fixture-user', state: 'ENDED', summary: {breakSeconds: 0}})],
    channel: [entity('channel', 'channel-a', {type: 'SITE_INTERNAL', member_ids: ['fixture-user'], site_id: 'site-a'})],
    assistant_config: [entity('assistant_config', 'assistant-a', {
      status: 'ACTIVE', provider: 'DISABLED', configVersion: 1, supportedLanguages: ['DE', 'UK', 'EN'],
    })],
  };
  const messages = [entity('message', 'message-a', {text: longName, sender_id: 'foreman-fixture', language: 'DE'})];
  const requests: {name: string; input: any}[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('knaba-language', 'EN'));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const ok = (body: unknown) => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(body)});
    const session = {mode: 'DEMO', csrfToken: 'synthetic-responsive-proof',
      actor: {userId: 'fixture-user', companyId: 'fixture-company', roles: [role || 'DIRECTOR'],
        permissions: ['*', ...new Set(catalog.map(cmd => cmd.permission))], siteIds: ['site-a'], customerIds: ['customer-a'], warehouseIds: ['warehouse-a']},
      user: {name: 'Synthetic layout reviewer', email: 'reviewer@example.invalid'}};
    if (path === '/api/v1/public/config') return ok({mode: 'TEST', services: [{id: 'service-a', name: longName}]});
    if (path === '/api/v1/me') return role ? ok(session) : route.fulfill({status: 401, contentType: 'application/json', body: '{"code":"NEEDS_REAUTH"}'});
    if (path === '/api/v1/auth/login') {role = 'DIRECTOR'; return ok(session);}
    if (path === '/api/v1/events') return route.fulfill({status: 200, contentType: 'text/event-stream', body: ': synthetic UI fixture\n\n'});
    if (path === '/api/v1/commands') return ok({items: catalog});
    if (path.startsWith('/api/v1/entities/')) return ok({items: records[decodeURIComponent(path.split('/').at(-1)!)] || []});
    if (path === '/api/v1/dashboard') return ok({decisions: records.decision, integrations: []});
    if (path === '/api/v1/audit') return ok({items: []});
    if (path === '/api/v1/public/leads') return ok({id: 'synthetic-lead'});
    if (path === '/api/v1/public/chat') return ok({channelId: 'guest-fixture', status: 'MANUAL_FALLBACK'});
    if (path.endsWith('/guest-fixture/messages')) return ok({items: messages, pendingDrafts: []});
    if (path.startsWith('/api/v1/commands/')) {
      const name = decodeURIComponent(path.split('/').at(-1)!);
      const input = route.request().postDataJSON()?.input || {};
      requests.push({name, input});
      if (name === 'message.read') return ok({items: messages});
      if (name === 'message.send') {messages.push(entity('message', 'sent-fixture', {...input, sender_id: 'fixture-user'})); return ok(messages.at(-1));}
      if (name === 'channel.unread') return ok([]);
      if (name === 'channel.mark_read') return ok({});
      if (name === 'translation.request') return ok({text: 'Synthetic translated message'});
      if (name === 'handoff.inbox') return ok({items: []});
      if (name === 'issue.context') return ok({siteId: 'site-a', locations: records.location.map(row => ({id: row.id, ...row.data})), tasks: records.task.map(row => ({id: row.id, ...row.data}))});
      if (name === 'assistant.usage') return ok({currency: 'EUR', from: stamp, to: stamp, asOf: stamp,
        categories: [], budgets: [], totals: {records: 0, reservedCents: 0, settledCents: 0, retainedReservationCents: 0, inputTokens: 0, outputTokens: 0, unknownCostRecords: 0, unknownTokenRecords: 0},
        keyStatus: {configured: false, validation: 'NOT_RUN'}, supplierStatus: 'DISABLED'});
      if (name === 'internal_assistant.list') return ok({requests: [], drafts: []});
      if (name === 'task.create') {
        const parsed = registry[name].schema.parse(input);
        const created = entity('task', 'created-fixture', parsed);
        records.task.push(created); return ok(created);
      }
      if (name === 'shift.start') return ok(entity('shift', 'started-fixture', input));
      if (name === 'issue.create') return ok(entity('issue', 'issue-fixture', input));
      if (name === 'privacy.request') return ok(entity('privacy_request', 'privacy-fixture', input));
      errors.push(`Unhandled responsive command fixture: ${name}`);
      return route.fulfill({status: 400, contentType: 'application/json', body: '{"code":"TEST_FIXTURE_MISSING"}'});
    }
    errors.push(`Unhandled responsive endpoint fixture: ${path}`);
    return route.fulfill({status: 404, contentType: 'application/json', body: '{"code":"TEST_FIXTURE_MISSING"}'});
  });
  return {records, requests, errors};
}

async function noOverflow(page: Page, context: string) {
  const layout = await page.evaluate(() => ({width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    offenders: Array.from(document.querySelectorAll('body *')).flatMap(element => {
      const box = element.getBoundingClientRect(), style = getComputedStyle(element);
      return box.width > 0 && style.visibility !== 'hidden' && box.right > innerWidth + 1
        ? [{tag: element.tagName, className: element.getAttribute('class'), right: Math.round(box.right)}] : [];
    }).slice(0, 20),
  }));
  expect(layout.scrollWidth, `${context}: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(layout.width + 1);
}
async function screenshot(page: Page, info: TestInfo, name: string) {
  await info.attach(name, {body: await page.screenshot({fullPage: true}), contentType: 'image/png'});
}
async function navigate(page: Page, key: string, language: Language = 'EN') {
  const toggle = page.locator('.topbar .mobile-only');
  if (await toggle.isVisible()) await toggle.click();
  const name = translator(language)(key);
  await page.locator('.sidebar nav').getByRole('button', {name, exact: true}).click();
  await expect(page.locator('.page-heading h1')).toHaveText(name);
  await expect(page.locator('.heading-actions .refresh .rotating')).toHaveCount(0);
}

for (const viewport of viewports) {
  test(`public entry and request form: ${viewport.width} × ${viewport.height}, six languages`, async ({page}, info) => {
    const state = await fixture(page, null);
    await page.setViewportSize(viewport); await page.goto('/');
    for (const language of ['DE', 'UK', 'RU', 'PL', 'LT', 'EN'] as Language[]) {
      await page.locator('.language-select select').selectOption(language);
      await expect(page.locator('html')).toHaveAttribute('lang', language.toLowerCase());
      await noOverflow(page, `public-${language}`);
      const t = translator(language);
      await page.locator('.public-route-cards').getByRole('button').first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('dialog').getByRole('textbox').first().fill(longName.slice(0, 110));
      await noOverflow(page, `public-request-${language}`);
      const bounds = await page.getByRole('dialog').boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
      await page.getByRole('dialog').locator('header').getByRole('button', {name: t('cancel')}).click();
    }
    if ([320, 768, 1440, 2560].includes(viewport.width)) await screenshot(page, info, `public-${viewport.width}`);
    expect(state.errors).toEqual([]);
  });
}

for (const width of [320, 768, 1440, 2560]) {
  test(`all console modules reflow at ${width}px`, async ({page}, info) => {
    const state = await fixture(page);
    await page.setViewportSize({width, height: width < 500 ? 740 : 1000}); await page.goto('/console');
    for (const key of ['overview','decisions','sites','leads','orders','tasks','time','travel','inventory','procurement','payroll','reports','chat','inbox','assistant','admin','audit','privacy']) {
      await navigate(page, key);
      await noOverflow(page, key);
      if (['overview','tasks','chat','assistant'].includes(key)) await screenshot(page, info, `${key}-${width}`);
    }
    const toggle = page.locator('.topbar .mobile-only'); if (await toggle.isVisible()) await toggle.click();
    await page.locator('.sidebar nav').getByRole('button', {name: 'Operations digests', exact: true}).click();
    await expect(page.getByTestId('digest-panel')).toBeVisible(); await noOverflow(page, 'digests');
    expect(state.errors).toEqual([]);
  });
}

test('compact navigation traps focus, closes with Escape and recovers after rotation', async ({page}, info) => {
  const state = await fixture(page); await page.setViewportSize({width: 320, height: 568}); await page.goto('/console');
  const toggle = page.locator('.topbar .mobile-only'), sidebar = page.locator('.sidebar');
  await expect(sidebar).toHaveAttribute('inert', '');
  await toggle.focus(); await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(sidebar).toHaveAttribute('aria-modal', 'true');
  await expect(sidebar.locator('.sidebar-brand button')).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(sidebar.locator('.brand')).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(sidebar.locator('.profile')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(sidebar.locator('.brand')).toBeFocused();
  await screenshot(page, info, 'navigation-phone');
  await page.keyboard.press('Escape'); await expect(toggle).toBeFocused();
  await expect(sidebar).toHaveAttribute('inert', '');
  await toggle.click(); await page.setViewportSize({width: 844, height: 390});
  await sidebar.locator('.profile').scrollIntoViewIfNeeded(); await expect(sidebar.locator('.profile')).toBeInViewport();
  await noOverflow(page, 'landscape-menu');
  await page.setViewportSize({width: 1440, height: 900});
  await expect(sidebar).not.toHaveAttribute('inert', '');
  await expect(page.locator('.sidebar-overlay')).toHaveCount(0);
  await expect(page.locator('.main-area')).not.toHaveAttribute('inert', '');
  await page.setViewportSize({width: 320, height: 568});
  await expect(sidebar).toHaveAttribute('inert', '');
  expect(state.errors).toEqual([]);
});

for (const viewport of [{width:320,height:568},{width:390,height:340},{width:768,height:1024},{width:1024,height:768},{width:1440,height:900}]) {
  test(`task create, review, table, board and deep tree: ${viewport.width} × ${viewport.height}`, async ({page}, info) => {
    const state = await fixture(page); await page.setViewportSize(viewport); await page.goto('/console'); await navigate(page, 'tasks');
    await page.locator('.heading-actions').getByRole('button', {name: 'Create new', exact: true}).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#field-siteId').selectOption('site-a');
    await dialog.locator('#field-title').fill('Synthetic responsive task');
    await noOverflow(page, 'task-edit');
    await dialog.getByRole('button', {name: 'Review change', exact: true}).click();
    const confirm = dialog.getByRole('button', {name: 'Confirm & execute', exact: true});
    await confirm.scrollIntoViewIfNeeded(); await expect(confirm).toBeInViewport();
    await noOverflow(page, 'task-review'); await screenshot(page, info, `task-review-${viewport.width}-${viewport.height}`);
    await confirm.click(); await expect(dialog.locator('.success-state')).toBeVisible();
    expect(state.requests.some(request => request.name === 'task.create' && request.input.title === 'Synthetic responsive task')).toBe(true);
    await dialog.getByRole('button', {name: 'Completed', exact: true}).click();
    const table = page.locator('.table-scroll');
    if (viewport.width < 600) {
      await table.focus(); await page.keyboard.press('ArrowRight');
      await expect.poll(() => table.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
      await table.evaluate(element => {element.scrollLeft = 0;});
    }
    await page.getByRole('button', {name: 'Board', exact: true}).click();
    await page.locator('.kanban-card').first().click(); await expect(page.getByRole('dialog')).toBeVisible();
    await noOverflow(page, 'board-detail'); await page.getByRole('dialog').locator('header button').click();
    await navigate(page, 'sites'); await page.getByRole('tab', {name: /Location tree/}).click();
    await page.locator('.list-filters').getByRole('button').last().click();
    await expect(page.locator('.tree-node')).toHaveCount(9); await noOverflow(page, 'deep-tree');
    await page.locator('.tree-node button').last().click(); await expect(page.getByRole('dialog')).toBeVisible();
    await noOverflow(page, 'deep-tree-detail'); expect(state.errors).toEqual([]);
  });
}

test('employee chat sends long text and shift form remains reachable with a short viewport', async ({page}, info) => {
  const state = await fixture(page, 'EMPLOYEE'); await page.setViewportSize({width: 390, height: 340}); await page.goto('/console');
  await expect(page.locator('.shift-card')).toBeVisible(); await noOverflow(page, 'employee-shift');
  await page.locator('.shift-actions').getByRole('button', {name: 'Start shift', exact: true}).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await noOverflow(page, 'employee-shift-form');
  await page.getByRole('dialog').locator('header button').click(); await navigate(page, 'chat');
  await page.locator('.channel-list > button').first().click();
  await page.getByRole('textbox', {name: 'Message', exact: true}).fill(longName);
  await page.getByRole('button', {name: 'Send', exact: true}).click();
  await expect(page.locator('.message-bubble').filter({hasText: longName})).toHaveCount(2);
  await expect(page.getByRole('textbox', {name: 'Message', exact: true})).toHaveValue('');
  await noOverflow(page, 'employee-chat'); await screenshot(page, info, 'employee-chat-short-viewport');
  expect(state.errors).toEqual([]);
});

test('customer portal and issue form preserve readable inputs at 320px', async ({page}, info) => {
  const state = await fixture(page, 'CLIENT'); await page.setViewportSize({width: 320, height: 568}); await page.goto('/console');
  await expect(page.locator('.page-heading h1')).toHaveText('My orders');
  await page.locator('.heading-actions').getByRole('button', {name: 'Report an issue', exact: true}).click();
  await expect(page.locator('.issue-composer')).toBeVisible();
  await noOverflow(page, 'customer-issue');
  const sizes = await page.getByRole('dialog').locator('input:not([type=checkbox]), select, textarea').evaluateAll(elements => elements.map(element => parseFloat(getComputedStyle(element).fontSize)));
  expect(sizes.length).toBeGreaterThan(0); expect(sizes.every(size => size >= 16)).toBe(true);
  await screenshot(page, info, 'customer-issue-phone'); expect(state.errors).toEqual([]);
});

test('login, activation, text enlargement and reduced motion remain usable', async ({page}, info) => {
  const state = await fixture(page, null); await page.setViewportSize({width: 320, height: 568}); await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/login'); await noOverflow(page, 'login');
  await page.getByLabel('Email', {exact:true}).fill('responsive@example.invalid');
  await page.getByLabel('Password', {exact:true}).fill('synthetic layout input');
  await screenshot(page, info, 'login-phone');
  await page.goto('/activate'); await noOverflow(page, 'activation');
  await page.goto('/');
  // Desktop 200% text preference: real layout reflow, not overridden measurements.
  await page.setViewportSize({width: 640, height: 900});
  await page.addStyleTag({content:'html {font-size: 200%}'});
  await noOverflow(page, '200-percent-text');
  await screenshot(page, info, 'public-enlarged-text'); expect(state.errors).toEqual([]);
});
