(function () {
  'use strict';

  const TEXT = {
    uk: {
      brand: 'Керування сайтами', language: 'Мова', skip: 'До списку сайтів', workspace: 'Особистий простір',
      title: 'Мої сайти', description: 'Керуйте сайтами свого облікового запису.', account: 'Обліковий запис',
      totalSites: 'Усього сайтів', localSites: 'На цьому сервері', externalSites: 'Зовнішні сайти', sites: 'Сайти',
      refresh: 'Оновити', refreshing: 'Оновлюємо…', retry: 'Спробувати знову', loading: 'Завантажуємо ваші сайти…',
      emptyTitle: 'Тут будуть ваші сайти', emptyDescription: 'До цього облікового запису ще не додано жодного сайту.',
      scope: 'Сайти вашого облікового запису', checked: 'Перевірено: {time}', notChecked: 'Стан ще не перевірений',
      running: 'Запущено', stopped: 'Зупинено', unknown: 'Стан невідомий', unavailable: 'Потребує перевірки',
      local: 'На цьому сервері', external: 'Зовнішній сайт', healthUnknown: 'Відповідь не перевірено',
      health: 'Відповідь: {status}', openSite: 'Відкрити сайт', admin: 'Адміністрування', noDomain: 'Домен не вказано',
      readOnly: 'Дії керування для цього сайту недоступні', start: 'Запустити', stop: 'Зупинити', restart: 'Перезапустити', backup: 'Резервна копія',
      confirmEyebrow: 'Підтвердження дії', cancel: 'Скасувати', stopTitle: 'Зупинити сайт?', restartTitle: 'Перезапустити сайт?',
      stopDescription: 'Сайт буде недоступним до наступного запуску. Переконайтеся, що зараз можна його зупинити.',
      restartDescription: 'Під час перезапуску сайт може бути тимчасово недоступним.', working: 'Виконуємо…',
      startDone: 'Сайт «{site}» запущено.', stopDone: 'Сайт «{site}» зупинено.', restartDone: 'Перезапуск сайту «{site}» виконано.', backupDone: 'Резервну копію сайту «{site}» створено.',
      errorTitle: 'Не вдалося завантажити сайти', errorDescription: 'Перевірте з’єднання й спробуйте оновити дані.',
      deniedTitle: 'Доступ недоступний', deniedDescription: 'Увійдіть в обліковий запис, якому надано доступ до керування сайтами.',
      sessionTitle: 'Потрібен вхід у панель', sessionDescription: 'Відкрийте цю сторінку через панель керування й увійдіть у свій обліковий запис.',
      invalidTitle: 'Не вдалося перевірити дані', invalidDescription: 'Панель отримала неповну відповідь. Оновіть дані перед виконанням дій.',
      actionError: 'Не вдалося підтвердити результат дії для «{site}». Оновіть стан перед повторною спробою.',
      actionDenied: 'Ця дія недоступна для вашого облікового запису. Оновіть список сайтів.',
      secureBrowser: 'Для цієї дії потрібен сучасний браузер із захищеним з’єднанням.',
      refreshFailed: 'Не вдалося оновити стан. Показані раніше дані більше не використовуються.',
      overview: 'Огляд сайтів', actionLabel: '{action}: {site}'
    },
    de: {
      brand: 'Website-Verwaltung', language: 'Sprache', skip: 'Zur Website-Liste', workspace: 'Mein Bereich',
      title: 'Meine Websites', description: 'Verwalten Sie die Websites Ihres Benutzerkontos.', account: 'Benutzerkonto',
      totalSites: 'Websites gesamt', localSites: 'Auf diesem Server', externalSites: 'Externe Websites', sites: 'Websites',
      refresh: 'Aktualisieren', refreshing: 'Wird aktualisiert…', retry: 'Erneut versuchen', loading: 'Ihre Websites werden geladen…',
      emptyTitle: 'Hier erscheinen Ihre Websites', emptyDescription: 'Diesem Benutzerkonto wurden noch keine Websites zugeordnet.',
      scope: 'Websites Ihres Benutzerkontos', checked: 'Geprüft: {time}', notChecked: 'Status noch nicht geprüft',
      running: 'Gestartet', stopped: 'Gestoppt', unknown: 'Status unbekannt', unavailable: 'Prüfung erforderlich',
      local: 'Auf diesem Server', external: 'Externe Website', healthUnknown: 'Antwort nicht geprüft',
      health: 'Antwort: {status}', openSite: 'Website öffnen', admin: 'Administration', noDomain: 'Keine Domain angegeben',
      readOnly: 'Für diese Website sind keine Verwaltungsaktionen verfügbar', start: 'Starten', stop: 'Stoppen', restart: 'Neustarten', backup: 'Sicherung',
      confirmEyebrow: 'Aktion bestätigen', cancel: 'Abbrechen', stopTitle: 'Website stoppen?', restartTitle: 'Website neu starten?',
      stopDescription: 'Die Website ist bis zum nächsten Start nicht erreichbar. Prüfen Sie, ob sie jetzt gestoppt werden kann.',
      restartDescription: 'Während des Neustarts ist die Website möglicherweise kurzzeitig nicht erreichbar.', working: 'Wird ausgeführt…',
      startDone: '„{site}“ wurde gestartet.', stopDone: '„{site}“ wurde gestoppt.', restartDone: 'Der Neustart von „{site}“ wurde ausgeführt.', backupDone: 'Eine Sicherung von „{site}“ wurde erstellt.',
      errorTitle: 'Websites konnten nicht geladen werden', errorDescription: 'Prüfen Sie Ihre Verbindung und aktualisieren Sie die Daten erneut.',
      deniedTitle: 'Zugriff nicht verfügbar', deniedDescription: 'Melden Sie sich mit einem für die Website-Verwaltung berechtigten Benutzerkonto an.',
      sessionTitle: 'Anmeldung erforderlich', sessionDescription: 'Öffnen Sie diese Seite über die Verwaltungsoberfläche und melden Sie sich mit Ihrem Benutzerkonto an.',
      invalidTitle: 'Daten konnten nicht geprüft werden', invalidDescription: 'Die Antwort war unvollständig. Aktualisieren Sie die Daten, bevor Sie eine Aktion ausführen.',
      actionError: 'Das Ergebnis für „{site}“ konnte nicht bestätigt werden. Aktualisieren Sie vor einem erneuten Versuch den Status.',
      actionDenied: 'Diese Aktion ist für Ihr Benutzerkonto nicht verfügbar. Aktualisieren Sie die Website-Liste.',
      secureBrowser: 'Für diese Aktion benötigen Sie einen aktuellen Browser mit einer sicheren Verbindung.',
      refreshFailed: 'Der Status konnte nicht aktualisiert werden. Frühere Daten werden nicht weiter verwendet.',
      overview: 'Website-Übersicht', actionLabel: '{action}: {site}'
    },
    en: {
      brand: 'Website management', language: 'Language', skip: 'Skip to websites', workspace: 'My workspace',
      title: 'My websites', description: 'Manage the websites assigned to your account.', account: 'Account',
      totalSites: 'Total websites', localSites: 'On this server', externalSites: 'External websites', sites: 'Websites',
      refresh: 'Refresh', refreshing: 'Refreshing…', retry: 'Try again', loading: 'Loading your websites…',
      emptyTitle: 'Your websites will appear here', emptyDescription: 'No websites have been assigned to this account yet.',
      scope: 'Websites assigned to your account', checked: 'Checked: {time}', notChecked: 'Status not checked yet',
      running: 'Running', stopped: 'Stopped', unknown: 'Status unknown', unavailable: 'Needs attention',
      local: 'On this server', external: 'External website', healthUnknown: 'Response not checked',
      health: 'Response: {status}', openSite: 'Open website', admin: 'Administration', noDomain: 'No domain specified',
      readOnly: 'Management actions are not available for this website', start: 'Start', stop: 'Stop', restart: 'Restart', backup: 'Backup',
      confirmEyebrow: 'Confirm action', cancel: 'Cancel', stopTitle: 'Stop this website?', restartTitle: 'Restart this website?',
      stopDescription: 'The website will be unavailable until you start it again. Make sure it can be stopped now.',
      restartDescription: 'The website may be briefly unavailable during the restart.', working: 'Working…',
      startDone: '“{site}” has been started.', stopDone: '“{site}” has been stopped.', restartDone: 'The restart of “{site}” has completed.', backupDone: 'A backup of “{site}” has been created.',
      errorTitle: 'Could not load websites', errorDescription: 'Check your connection and try refreshing the data.',
      deniedTitle: 'Access unavailable', deniedDescription: 'Sign in with an account that has access to website management.',
      sessionTitle: 'Sign-in required', sessionDescription: 'Open this page through the management panel and sign in with your account.',
      invalidTitle: 'Could not verify the data', invalidDescription: 'The panel received an incomplete response. Refresh the data before performing an action.',
      actionError: 'The result for “{site}” could not be confirmed. Refresh its status before trying again.',
      actionDenied: 'This action is not available to your account. Refresh the website list.',
      secureBrowser: 'This action requires a current browser with a secure connection.',
      refreshFailed: 'Could not refresh the status. Previously shown data is no longer being used.',
      overview: 'Website overview', actionLabel: '{action}: {site}'
    }
  };
  const ACTIONS = ['start', 'restart', 'backup', 'stop'];
  const COMMAND = '/usr/local/bin/sitepanel';
  const $ = (id) => document.getElementById(id);
  const browserLanguage = (navigator.language || 'uk').split('-')[0].toLowerCase();
  const state = { language: TEXT[browserLanguage] ? browserLanguage : 'uk', catalog: null, loading: false, busy: null, error: null, notice: null, confirmation: null, selectedAccount: null, uncertainRequests: new Map(), generation: 0 };

  function t(key, variables) {
    let value = TEXT[state.language][key] || TEXT.en[key] || key;
    for (const [name, replacement] of Object.entries(variables || {})) value = value.replaceAll('{' + name + '}', String(replacement));
    return value;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function safeURL(value) {
    if (typeof value !== 'string' || value.length > 2048) return null;
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch (_) { return null; }
  }

  function domainURL(domain) {
    if (!domain || /[\s\/@:#?\\]/u.test(domain)) return null;
    return safeURL('https://' + domain);
  }

  function link(label, url, className) {
    const target = safeURL(url);
    if (!target) return null;
    const node = element('a', className, label);
    node.href = target;
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
    return node;
  }

  function parseReply(output) {
    if (typeof output !== 'string' || output.length > 1048576) throw Object.assign(new Error(), { kind: 'invalid' });
    let reply;
    try { reply = JSON.parse(output); } catch (_) { throw Object.assign(new Error(), { kind: 'invalid' }); }
    if (!reply || typeof reply.ok !== 'boolean') throw Object.assign(new Error(), { kind: 'invalid' });
    if (!reply.ok) {
      const code = String(reply.error?.code || '').toLowerCase();
      const uncertain = ['result_unknown', 'unavailable', 'pending', 'operation_pending', 'in_progress', 'timeout'].includes(code);
      throw Object.assign(new Error(), { kind: /denied|forbidden|account|unauthorized/.test(code) ? 'denied' : 'request', definitive: !uncertain });
    }
    return reply;
  }

  function validateCatalog(reply) {
    const invalid = () => { throw Object.assign(new Error(), { kind: 'invalid' }); };
    if (reply.scope !== 'own-sites' || !reply.account || !['knaba', 'vsp'].includes(reply.account.name) || !Array.isArray(reply.sites) || reply.sites.length > 200) invalid();
    if (typeof reply.account.display_name !== 'string' || reply.account.display_name.length > 160 || !Number.isFinite(Date.parse(reply.checked_at))) invalid();
    const seen = new Set();
    for (const site of reply.sites) {
      if (!site || typeof site.id !== 'string' || !/^[a-z0-9][a-z0-9_.-]{0,127}$/i.test(site.id) || seen.has(site.id)) invalid();
      seen.add(site.id);
      if (typeof site.label !== 'string' || site.label.length > 160 || !['local', 'external'].includes(site.location) || !['running', 'stopped', 'unknown'].includes(site.state)) invalid();
      if (!Array.isArray(site.domains) || site.domains.length > 50 || !site.domains.every((domain) => typeof domain === 'string' && domain.length <= 253)) invalid();
      if (!Array.isArray(site.actions) || !site.actions.every((action) => ACTIONS.includes(action))) invalid();
      if (site.note != null && (typeof site.note !== 'string' || site.note.length > 2000)) invalid();
      if (site.health?.status != null && (!Number.isInteger(site.health.status) || site.health.status < 100 || site.health.status > 599)) invalid();
    }
    return reply;
  }

  function run(args, timeout) {
    return new Promise((resolve, reject) => {
      if (!window.cockpit || typeof window.cockpit.spawn !== 'function') { reject(Object.assign(new Error(), { kind: 'session' })); return; }
      let process;
      try {
        // Omitting superuser runs as the logged-in user. Tenant selection stays on the server.
        process = window.cockpit.spawn([COMMAND, ...args], { err: 'message' });
      } catch (_) { reject(Object.assign(new Error(), { kind: 'request' })); return; }
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        try { process.close(); } catch (_) { /* The transport may already be closed. */ }
        reject(Object.assign(new Error(), { kind: 'timeout' }));
      }, timeout);
      process.then((output) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(output);
      }, (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(Object.assign(new Error(), { kind: error?.problem === 'access-denied' ? 'denied' : 'request' }));
      });
    });
  }

  function selectAccountLanguage(name) {
    if (state.selectedAccount === name) return;
    state.selectedAccount = name;
    let saved;
    try { saved = localStorage.getItem('sitepanel.language.' + name); } catch (_) { /* Storage is optional. */ }
    state.language = TEXT[saved] ? saved : (name === 'knaba' ? 'de' : 'uk');
  }

  function translatePage() {
    document.documentElement.lang = state.language;
    document.title = t('title');
    document.querySelectorAll('[data-text]').forEach((node) => { node.textContent = t(node.dataset.text); });
    $('language').value = state.language;
    $('language').setAttribute('aria-label', t('language'));
    $('overview').setAttribute('aria-label', t('overview'));
    if (state.loading) $('refresh').querySelector('[data-text]').textContent = t('refreshing');
  }

  function renderSite(site) {
    const card = element('article', 'site-card');
    card.dataset.siteId = site.id;
    const main = element('div', 'site-main');
    const content = element('div', 'site-content');
    const heading = element('div', 'site-heading');
    const title = element('h3', '', site.label);
    title.id = 'site-' + site.id;
    card.setAttribute('aria-labelledby', title.id);
    heading.append(title);
    const needsAttention = site.state === 'running' && site.health?.status >= 400;
    const status = needsAttention ? 'unavailable' : site.state;
    heading.append(element('span', 'status status-' + status, t(status)));
    content.append(heading);
    const domains = element('div', 'site-domains');
    for (const domain of site.domains) domains.append(link(domain, domainURL(domain), 'domain-link') || element('span', 'domain-label', domain));
    if (!site.domains.length) domains.append(element('span', 'domain-label', t('noDomain')));
    content.append(domains);
    if (site.note) content.append(element('p', 'site-note', site.note));
    const info = element('div', 'site-info');
    info.append(element('span', 'location-tag', t(site.location)));
    info.append(element('span', 'health-tag' + (site.health?.status >= 400 ? ' health-failed' : ''), site.health?.status != null ? t('health', { status: site.health.status }) : t('healthUnknown')));
    main.append(content, info);
    const footer = element('div', 'site-footer');
    const links = element('div', 'site-links');
    const publicLink = link(t('openSite'), site.url, 'button button-secondary');
    const adminLink = link(t('admin'), site.admin_url, 'button button-quiet');
    if (publicLink) links.append(publicLink);
    if (adminLink) links.append(adminLink);
    const actions = element('div', 'site-actions');
    for (const action of ACTIONS.filter((value) => site.actions.includes(value))) {
      const button = element('button', 'button ' + (action === 'stop' ? 'button-danger' : 'button-secondary'), state.busy?.siteId === site.id && state.busy.action === action ? t('working') : t(action));
      button.type = 'button';
      button.dataset.action = action;
      button.setAttribute('aria-label', t('actionLabel', { action: t(action), site: site.label }));
      button.disabled = state.loading || Boolean(state.busy) || Boolean(state.error);
      button.addEventListener('click', () => requestAction(site.id, action));
      actions.append(button);
    }
    if (!actions.childElementCount) actions.append(element('span', 'readonly-note', t('readOnly')));
    footer.append(links, actions);
    card.append(main, footer);
    return card;
  }

  function render() {
    translatePage();
    const catalog = state.catalog;
    $('workspace').setAttribute('aria-busy', String(state.loading || Boolean(state.busy)));
    $('refresh').disabled = state.loading || Boolean(state.busy);
    $('retry').disabled = state.loading || Boolean(state.busy);
    $('language').disabled = Boolean(state.busy);
    $('loading-panel').hidden = !state.loading || Boolean(catalog);
    $('overview').hidden = !catalog;
    $('account-badge').hidden = !catalog;
    $('workspace-footer').hidden = !catalog;
    $('empty-panel').hidden = !catalog || catalog.sites.length !== 0;
    $('error-panel').hidden = !state.error;
    $('notice').hidden = !state.notice;
    if (state.error) {
      const prefix = ['denied', 'session', 'invalid'].includes(state.error.kind) ? state.error.kind : 'error';
      $('error-title').textContent = t(prefix + 'Title');
      $('error-description').textContent = t(prefix + 'Description');
    }
    if (state.notice) {
      $('notice').textContent = t(state.notice.key, state.notice.variables);
      $('notice').className = 'notice' + (state.notice.error ? ' notice-error' : '');
      $('notice').setAttribute('role', state.notice.error ? 'alert' : 'status');
    }
    $('site-list').replaceChildren();
    if (!catalog) { $('checked-label').textContent = t('notChecked'); return; }
    $('account-name').textContent = catalog.account.display_name;
    $('account-avatar').textContent = catalog.account.display_name.slice(0, 1).toUpperCase();
    $('footer-user').textContent = catalog.account.name;
    $('total-sites').textContent = String(catalog.sites.length);
    $('local-sites').textContent = String(catalog.sites.filter((site) => site.location === 'local').length);
    $('external-sites').textContent = String(catalog.sites.filter((site) => site.location === 'external').length);
    const checkedAt = new Intl.DateTimeFormat(state.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(catalog.checked_at));
    $('checked-label').textContent = t('checked', { time: checkedAt });
    for (const site of catalog.sites) $('site-list').append(renderSite(site));
  }

  async function loadCatalog(keepNotice) {
    if (state.loading || state.busy) return;
    const generation = ++state.generation;
    state.loading = true;
    state.error = null;
    if (!keepNotice) state.notice = null;
    render();
    try {
      const catalog = validateCatalog(parseReply(await run(['catalog'], 25000)));
      if (generation !== state.generation) return;
      if (state.selectedAccount && state.selectedAccount !== catalog.account.name) state.uncertainRequests.clear();
      selectAccountLanguage(catalog.account.name);
      state.catalog = catalog;
    } catch (error) {
      if (generation !== state.generation) return;
      state.catalog = null;
      state.error = error;
    } finally {
      if (generation === state.generation) { state.loading = false; render(); }
    }
  }

  function getSite(siteId, action) {
    const site = state.catalog?.sites.find((value) => value.id === siteId);
    return site && site.actions.includes(action) ? site : null;
  }

  function requestAction(siteId, action) {
    if (state.loading || state.busy || state.error) return;
    const site = getSite(siteId, action);
    if (!site) return;
    if (action === 'stop' || action === 'restart') {
      if (typeof $('confirm-dialog').showModal !== 'function') {
        state.notice = { key: 'secureBrowser', error: true };
        render();
        return;
      }
      state.confirmation = { siteId, action, focus: document.activeElement };
      $('confirm-title').textContent = t(action + 'Title');
      $('confirm-description').textContent = t(action + 'Description');
      $('confirm-site').textContent = site.label;
      $('confirm-submit').textContent = t(action);
      $('confirm-submit').className = 'button ' + (action === 'stop' ? 'button-danger' : 'button-primary');
      $('confirm-dialog').showModal();
      $('confirm-cancel').focus();
    } else performAction(siteId, action);
  }

  function closeConfirmation() {
    const focus = state.confirmation?.focus;
    state.confirmation = null;
    if ($('confirm-dialog').open) $('confirm-dialog').close();
    if (focus?.isConnected) focus.focus();
  }

  function requestId() {
    if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') throw Object.assign(new Error(), { kind: 'secureBrowser' });
    if (typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  }

  async function performAction(siteId, action) {
    const site = getSite(siteId, action);
    if (!site || state.loading || state.busy || state.error) return;
    const key = site.id + ':' + action;
    state.busy = { siteId, action };
    state.notice = null;
    render();
    try {
      const id = state.uncertainRequests.get(key) || requestId();
      state.uncertainRequests.set(key, id);
      const reply = parseReply(await run(['action', site.id, action, id], 120000));
      if (reply.result?.state !== 'completed') throw Object.assign(new Error(), { kind: 'invalid' });
      state.uncertainRequests.delete(key);
      state.notice = { key: action + 'Done', variables: { site: site.label }, error: false };
    } catch (error) {
      if (error.definitive) state.uncertainRequests.delete(key);
      state.notice = { key: error.kind === 'denied' ? 'actionDenied' : (error.kind === 'secureBrowser' ? 'secureBrowser' : 'actionError'), variables: { site: site.label }, error: true };
    } finally {
      state.busy = null;
      render();
      // Refresh is read-only. Mutating operations are never retried automatically.
      await loadCatalog(true);
      const heading = $('site-' + siteId);
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    }
  }

  $('refresh').addEventListener('click', () => loadCatalog(false));
  $('retry').addEventListener('click', () => loadCatalog(false));
  $('language').addEventListener('change', (event) => {
    if (!TEXT[event.target.value]) return;
    state.language = event.target.value;
    if (state.selectedAccount) try { localStorage.setItem('sitepanel.language.' + state.selectedAccount, state.language); } catch (_) { /* Storage is optional. */ }
    render();
  });
  $('confirm-cancel').addEventListener('click', closeConfirmation);
  $('confirm-dialog').addEventListener('cancel', () => { state.confirmation = null; });
  $('confirm-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const confirmation = state.confirmation;
    closeConfirmation();
    if (confirmation) performAction(confirmation.siteId, confirmation.action);
  });
  loadCatalog(false);
}());
