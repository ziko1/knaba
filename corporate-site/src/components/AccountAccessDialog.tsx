import { createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from 'solid-js';
import { accountDestinations, accountRoles, type AccountRole, type AccessMode } from '../lib/account-access';
import { safeWorkspaceRedirect } from '../lib/workspace-navigation';
import type { PortalLocale } from '../lib/portal-i18n';
import type { PortalSession } from '../lib/portal-contract';

import {plAccess,ltAccess} from '../lib/account-extra-locales';

const copy = {
 pl:plAccess,lt:ltAccess,
 de: {title:'Ihr KnaBa Zugang',intro:'Ein sicherer Zugang zu Ihrem persönlichen Arbeitsbereich.',choose:'Welchen Bereich möchten Sie öffnen?',client:'Kunde',worker:'Mitarbeiter',partner:'Partner',bauleiter:'Bauleiter',admin:'Verwaltung',login:'Anmelden',email:'E-Mail',password:'Passwort',show:'Anzeigen',hide:'Verbergen',working:'Bitte warten …',error:'Anmeldung fehlgeschlagen. Prüfen Sie E-Mail und Passwort.',network:'Die Verbindung ist fehlgeschlagen. Ihre Eingaben bleiben erhalten. Versuchen Sie es erneut.',rate:'Zu viele Versuche. Bitte warten Sie kurz und versuchen Sie es erneut.',request:'Zugang anfragen',invite:'Einladung einlösen',forgot:'Passwort vergessen?',close:'Schließen',ready:'Sie sind angemeldet.',mismatch:'Ihr bestätigter Zugang unterscheidet sich vom gewählten Bereich. Öffnen Sie Ihren verfügbaren Arbeitsbereich.',portal:'Meinen Arbeitsbereich öffnen',administration:'Verwaltung öffnen',pending:'Ihr Zugang wartet auf Freigabe durch KNABA.',suspended:'Ihr Zugang ist pausiert. Bitte kontaktieren Sie KNABA.',requestIntro:'KNABA prüft Ihre Anfrage und kann Ihnen nach Bestätigung Ihrer Identität eine persönliche Einladung geben. Hier wird noch kein Konto erstellt.',name:'Vollständiger Name',privacy:'Ich habe die Datenschutzhinweise gelesen und stimme der Bearbeitung meiner Anfrage zu.',privacyLink:'Datenschutzhinweise',sent:'Ihre Anfrage wurde entgegengenommen. KNABA prüft Ihren Zugang; es wurde noch kein Konto erstellt.',inviteIntro:'Lösen Sie Ihre persönliche Einladung ein. Die darin festgelegte Rolle wird nach Prüfung durch KNABA freigegeben.',token:'Persönlicher Einladungscode',newPassword:'Passwort (8–256 Zeichen)',confirm:'Passwort bestätigen',created:'Ihr Konto wurde erstellt. Melden Sie sich an; neue Zugänge warten auf Freigabe.',invalidForm:'Die Angaben konnten nicht verarbeitet werden. Prüfen Sie den Code und Ihre Eingaben.',recover:'Bitte kontaktieren Sie KNABA, damit Ihre Identität geprüft und der Zugang wiederhergestellt werden kann.',contact:'KNABA kontaktieren',back:'Zur Anmeldung',role:'Bestätigter Zugang',unknown:'Zugang prüfen',matches:'Die Passwörter stimmen nicht überein.',noToken:'Geben Sie den gültigen persönlichen Einladungscode ein.'},
 en: {title:'Your KnaBa account',intro:'One secure entry to your personal workspace.',choose:'Which workspace would you like to open?',client:'Client',worker:'Worker',partner:'Partner',bauleiter:'Site manager',admin:'Administration',login:'Sign in',email:'Email address',password:'Password',show:'Show',hide:'Hide',working:'Please wait …',error:'Sign-in failed. Check your email and password.',network:'Could not connect. Your input is retained. Please try again.',rate:'Too many attempts. Please wait a moment and try again.',request:'Request access',invite:'Use an invitation',forgot:'Forgot password?',close:'Close',ready:'You are signed in.',mismatch:'Your approved access differs from the workspace you selected. Open your available workspace below.',portal:'Open my workspace',administration:'Open administration',pending:'Your access is awaiting KNABA approval.',suspended:'Your access is paused. Please contact KNABA.',requestIntro:'KNABA will review your request and may provide a personal invitation after checking your identity. This does not create an account.',name:'Full name',privacy:'I have read the privacy notice and agree to the processing of my request.',privacyLink:'Privacy notice',sent:'Your request was received. KNABA will review your access; no account has been created.',inviteIntro:'Use your personal invitation. KNABA approves the access role specified in it.',token:'Personal invitation code',newPassword:'Password (8–256 characters)',confirm:'Confirm password',created:'Your account has been created. Sign in; new access awaits approval.',invalidForm:'Could not process these details. Check your invitation code and input.',recover:'Contact KNABA so your identity can be checked and your access restored.',contact:'Contact KNABA',back:'Back to sign-in',role:'Approved access',unknown:'Check account access',matches:'The passwords do not match.',noToken:'Enter a valid personal invitation code.'},
 uk: {title:'Ваш кабінет KnaBa',intro:'Єдиний безпечний вхід до вашого робочого простору.',choose:'Який кабінет ви хочете відкрити?',client:'Клієнт',worker:'Робітник',partner:'Партнер',bauleiter:'Бауляйтер',admin:'Адміністрація',login:'Увійти',email:'Електронна пошта',password:'Пароль',show:'Показати',hide:'Приховати',working:'Зачекайте …',error:'Не вдалося увійти. Перевірте електронну пошту та пароль.',network:'Немає з’єднання. Ваші дані у формі збережено. Спробуйте ще раз.',rate:'Забагато спроб. Трохи зачекайте та повторіть.',request:'Запросити доступ',invite:'Активувати запрошення',forgot:'Забули пароль?',close:'Закрити',ready:'Ви увійшли.',mismatch:'Ваш підтверджений доступ відрізняється від вибраного кабінету. Нижче можна відкрити доступний вам робочий простір.',portal:'Відкрити мій кабінет',administration:'Відкрити адмінпанель',pending:'Ваш доступ очікує підтвердження KNABA.',suspended:'Ваш доступ призупинено. Зверніться до KNABA.',requestIntro:'KNABA перевірить заявку й після підтвердження особи зможе надати персональне запрошення. Ця заявка ще не створює обліковий запис.',name:'Повне ім’я',privacy:'Я прочитав(-ла) політику конфіденційності та погоджуюся на обробку заявки.',privacyLink:'Політика конфіденційності',sent:'Заявку отримано. KNABA перевірить доступ; обліковий запис ще не створено.',inviteIntro:'Скористайтеся персональним запрошенням. Зазначену в ньому роль підтверджує KNABA.',token:'Персональний код запрошення',newPassword:'Пароль (8–256 символів)',confirm:'Підтвердіть пароль',created:'Обліковий запис створено. Увійдіть; новий доступ очікує підтвердження.',invalidForm:'Не вдалося обробити дані. Перевірте код запрошення та заповнення форми.',recover:'Зверніться до KNABA для перевірки особи й відновлення доступу.',contact:'Зв’язатися з KNABA',back:'До входу',role:'Підтверджений доступ',unknown:'Перевірити доступ',matches:'Паролі не збігаються.',noToken:'Введіть чинний персональний код запрошення.'},
 ru: {title:'Ваш кабинет KnaBa',intro:'Единый безопасный вход в ваше рабочее пространство.',choose:'Какой кабинет вы хотите открыть?',client:'Клиент',worker:'Работник',partner:'Партнёр',bauleiter:'Бауляйтер',admin:'Администрация',login:'Войти',email:'Электронная почта',password:'Пароль',show:'Показать',hide:'Скрыть',working:'Подождите …',error:'Не удалось войти. Проверьте почту и пароль.',network:'Нет соединения. Данные формы сохранены. Повторите попытку.',rate:'Слишком много попыток. Подождите немного и повторите.',request:'Запросить доступ',invite:'Активировать приглашение',forgot:'Забыли пароль?',close:'Закрыть',ready:'Вы вошли.',mismatch:'Ваш подтверждённый доступ отличается от выбранного кабинета. Откройте доступное вам рабочее пространство ниже.',portal:'Открыть мой кабинет',administration:'Открыть админпанель',pending:'Ваш доступ ожидает подтверждения KNABA.',suspended:'Ваш доступ приостановлен. Свяжитесь с KNABA.',requestIntro:'KNABA проверит заявку и после подтверждения личности сможет выдать приглашение. Заявка пока не создаёт аккаунт.',name:'Полное имя',privacy:'Я прочитал(а) политику конфиденциальности и согласен(согласна) на обработку заявки.',privacyLink:'Политика конфиденциальности',sent:'Заявка получена. KNABA проверит доступ; аккаунт пока не создан.',inviteIntro:'Используйте личное приглашение. Указанную в нём роль подтверждает KNABA.',token:'Личный код приглашения',newPassword:'Пароль (8–256 символов)',confirm:'Подтвердите пароль',created:'Аккаунт создан. Войдите; новый доступ ожидает подтверждения.',invalidForm:'Не удалось обработать данные. Проверьте код приглашения и поля формы.',recover:'Свяжитесь с KNABA для проверки личности и восстановления доступа.',contact:'Связаться с KNABA',back:'К входу',role:'Подтверждённый доступ',unknown:'Проверить доступ',matches:'Пароли не совпадают.',noToken:'Введите действующий личный код приглашения.'}
};

export default function AccountAccessDialog(props: {
  locale: PortalLocale; mode: AccessMode; initialRole?: AccountRole; returnTo?: string;
  token?: string; trigger?: HTMLElement; onClose: () => void;
}) {
  const [mode, setMode] = createSignal(props.mode);
  const [selected, setSelected] = createSignal<AccountRole | undefined>(props.initialRole);
  const [session, setSession] = createSignal<PortalSession | null>(null);
  const [checking, setChecking] = createSignal(props.mode === 'login');
  const [pending, setPending] = createSignal(false);
  const [dirty, setDirty] = createSignal(false);
  const [error, setError] = createSignal('');
  const [info, setInfo] = createSignal('');
  const [showPassword, setShowPassword] = createSignal(false);
  const [token, setToken] = createSignal(props.token ?? '');
  const [providers, setProviders] = createSignal<string[]>([]);
  const t = createMemo(() => copy[props.locale]);
  const role = () => session()?.role ?? 'anonymous';
  const signedIn = () => Boolean(session()?.user);
  const mismatch = () => Boolean(selected() && role() !== selected() && !(selected() === 'admin' && role() === 'owner'));
  const destinations = () => accountDestinations(role(), props.locale, props.returnTo);
  const privacy = () => props.locale === 'ru' ? '/ru/datenschutz/' : '/datenschutz/';
  const contact = () => (props.locale === 'de' ? '' : `/${props.locale}`) + '/kontakt/';
  let dialog!: HTMLDialogElement;
  let heading!: HTMLHeadingElement;
  let controller: AbortController | undefined;
  let disposed = false;
  let generation = 0;
  let previousOverflow = '';
  let focusFrom: HTMLElement | null = null;
  let loginAttempted = false;

  function cancelRequest() { generation++; controller?.abort(); controller = undefined; }
  function close() { cancelRequest(); props.onClose(); }
  function change(next: AccessMode) {
    cancelRequest(); setPending(false); setChecking(false); setMode(next); setError(''); setInfo(''); setShowPassword(false); setDirty(false);
    if (next === 'login') discoverSession();
    queueMicrotask(() => { if (!disposed) heading?.focus(); });
  }
  async function request(path: string, init: RequestInit = {}) {
    const active = new AbortController(); controller = active;
    const timeout = setTimeout(() => active.abort(), 15000);
    try { return await fetch(path, { credentials:'same-origin', cache:'no-store', ...init, signal:active.signal }); }
    finally { clearTimeout(timeout); }
  }
  async function readSession() {
    const response = await request('/api/portal/session', {headers:{Accept:'application/json'}});
    if (!response.ok) throw new Error('session');
    const value = await response.json() as PortalSession;
    if (!value || typeof value.role !== 'string') throw new Error('session');
    return value;
  }
  function discoverSession() {
      setChecking(true); setSession(null);
      const attempt = ++generation;
      void readSession().then(async value => {
        if (disposed || generation !== attempt) return;
        setSession(value);
        if (!value.user) {
          const options = await request('/login/', {headers:{Accept:'application/json'}});
          if (options.ok && options.headers.get('Content-Type')?.includes('application/json')) {
            const data = await options.json() as {providers?: unknown};
            if (!disposed && generation === attempt && Array.isArray(data.providers)) setProviders(data.providers.filter((item): item is string => item === 'google' || item === 'microsoft'));
          }
        }
      })
        .catch(() => { /* Sign-in remains available when session discovery fails. */ })
        .finally(() => { if (!disposed && generation === attempt) setChecking(false); });
  }
  onMount(() => {
    focusFrom = props.trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal(); heading.focus();
    if (props.mode === 'login') discoverSession();
    const beforeLeave = (event: BeforeUnloadEvent) => { if (dirty()) { event.preventDefault(); Reflect.set(event,'returnValue',''); } };
    window.addEventListener('beforeunload', beforeLeave);
    onCleanup(() => window.removeEventListener('beforeunload', beforeLeave));
  });
  onCleanup(() => {
    disposed = true; cancelRequest();
    if (dialog?.open) dialog.close();
    document.body.style.overflow = previousOverflow;
    // A response may have installed an HttpOnly session just before cancellation.
    // This only requests fresh server authority; it never carries a client-chosen role.
    if (loginAttempted) document.dispatchEvent(new CustomEvent('knaba:auth-changed'));
    if (focusFrom?.isConnected) focusFrom.focus();
  });
  function revealError(message: string) {
    setError(message);
    queueMicrotask(() => { if (!disposed) dialog?.querySelector<HTMLElement>('[data-account-error]')?.focus(); });
  }
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (pending() || checking()) return;
    const form = event.currentTarget as HTMLFormElement;
    const fields = new FormData(form);
    const action = mode();
    const values = new URLSearchParams();
    if (action === 'invite' && !/^[A-Za-z0-9_-]{43}$/.test(token())) { revealError(t().noToken); return; }
    if (action === 'invite' && fields.get('password') !== fields.get('password_confirm')) { revealError(t().matches); return; }
    if (action === 'login') {
      for (const key of ['email','password']) values.set(key, String(fields.get(key) ?? ''));
      values.set('return_to', `/konto/?lang=${props.locale}`);
    } else if (action === 'request') {
      for (const key of ['name','email','intent','privacy','website']) values.set(key, String(fields.get(key) ?? ''));
    } else if (action === 'invite') {
      for (const key of ['name','email','password','password_confirm','privacy']) values.set(key, String(fields.get(key) ?? ''));
      values.set('token', token());
    } else return;
    cancelRequest(); const attempt = ++generation;
    setPending(true); setError(''); setInfo('');
    try {
      const path = action === 'login' ? 'login' : action === 'request' ? 'join' : 'register';
      if (action === 'login') loginAttempted = true;
      const response = await request(`/${path}/?lang=${props.locale}`, {
        method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',Accept:action === 'login' ? 'application/json' : 'text/html'},body:values
      });
      if (action === 'login' && response.ok) document.dispatchEvent(new CustomEvent('knaba:auth-changed'));
      if (disposed || attempt !== generation) return;
      if (action === 'login' && response.ok) {
        const result = await response.json() as { authenticated?: boolean; returnTo?: unknown };
        const destination = result.authenticated === true ? safeWorkspaceRedirect(result.returnTo) : null;
        if (!destination) throw new Error('destination');
        if (disposed || attempt !== generation || !dialog.open) return;
        const proof = await readSession();
        if (disposed || attempt !== generation || !dialog.open) return;
        if (!proof.user || proof.role === 'anonymous') throw new Error('session');
        form.reset(); setDirty(false); setShowPassword(false); setSession(proof);
        window.location.assign(destination);
      } else if (action === 'request' && response.status === 202) {
        form.reset(); setDirty(false); setInfo(t().sent);
      } else if (action === 'invite' && response.ok && response.redirected && new URL(response.url).pathname === '/login/') {
        form.reset(); setToken(''); change('login'); setInfo(t().created);
      } else {
        revealError(response.status === 429 ? t().rate : action === 'login' && response.status === 401 ? t().error : t().invalidForm);
      }
    } catch {
      if (!disposed && attempt === generation) revealError(t().network);
    } finally { if (!disposed && attempt === generation) setPending(false); }
  }
  function openDestination(event: MouseEvent, href: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const destination = new URL(href, location.origin);
    if (destination.pathname === location.pathname) {
      event.preventDefault(); history.replaceState(history.state, '', destination.href);
      document.dispatchEvent(new CustomEvent('knaba:auth-changed')); close();
    }
  }
  function keepKeyboardFocus(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;
    // Native modality makes the page inert. Explicit boundary wrapping also
    // keeps keyboard focus out of browser chrome in engines that allow it.
    const controls = [...dialog.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]')]
      .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (!first || !last) { event.preventDefault(); heading.focus(); return; }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !controls.includes(active as HTMLElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (active === last || !controls.includes(active as HTMLElement))) {
      event.preventDefault(); first.focus();
    }
  }
  return <dialog ref={dialog} class="knaba-access-dialog" aria-labelledby="knaba-access-title" lang={props.locale} onInput={() => setDirty(true)} onChange={() => setDirty(true)}
    onKeyDown={keepKeyboardFocus}
    onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } }}>
    <div class="knaba-access-content">
      <header class="knaba-access-heading"><div><span class="knaba-access-kicker">KNABA</span><h2 ref={heading} tabIndex={-1} id="knaba-access-title">{mode() === 'login' ? t().title : mode() === 'request' ? t().request : mode() === 'invite' ? t().invite : t().forgot}</h2></div><button type="button" class="knaba-access-close" aria-label={t().close} onClick={close}>×</button></header>
      <Show when={error()}><p data-account-error tabIndex={-1} class="knaba-access-error" role="alert">{error()}</p></Show>
      <Show when={info()}><p class="knaba-access-info" role="status">{info()}</p></Show>
      <Switch>
        <Match when={mode() === 'login'}>
          <p>{t().intro}</p>
          <fieldset class="knaba-access-roles" disabled={pending()}><legend>{t().choose}</legend><div class="knaba-access-role-grid"><For each={accountRoles}>{item => <button type="button" data-account-role={item} aria-pressed={selected() === item} onClick={() => setSelected(item)}>{t()[item]}</button>}</For></div></fieldset>
          <Show when={checking()}><p role="status">{t().working}</p></Show>
          <Show when={!checking() && signedIn()}>
            <div class="knaba-access-session" role="status"><p><strong>{t().ready}</strong> {t().role}: {role() === 'pending' ? t().pending : role() === 'suspended' ? t().suspended : role() === 'owner' ? t().admin : t()[role() as AccountRole] ?? t().unknown}</p><Show when={mismatch()}><p class="knaba-access-info">{t().mismatch}</p></Show></div>
            <div class="knaba-access-destinations"><For each={destinations()}>{item => <a data-astro-reload data-account-destination={item.id} class={`knaba-access-primary ${item.id === 'admin' ? 'knaba-access-secondary' : ''}`} href={item.href} onClick={event => openDestination(event, item.href)}>{item.id === 'admin' ? t().administration : t().portal} →</a>}</For></div>
          </Show>
          <Show when={!checking() && !signedIn()}><form class="knaba-access-form" onSubmit={submit} aria-busy={pending()}>
            <label>{t().email}<input name="email" type="email" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck={false} required maxLength={320}/></label>
            <label for="knaba-login-password">{t().password}</label><div class="knaba-access-password"><input id="knaba-login-password" name="password" type={showPassword() ? 'text' : 'password'} autocomplete="current-password" required minLength={8} maxLength={256}/><button type="button" aria-controls="knaba-login-password" aria-pressed={showPassword()} onClick={() => setShowPassword(!showPassword())}>{showPassword() ? t().hide : t().show}</button></div>
            <button class="knaba-access-primary" type="submit" disabled={pending()}>{pending() ? t().working : t().login}</button>
          </form></Show>
          <Show when={!checking() && !signedIn() && providers().length}><nav class="knaba-access-links" aria-label={t().login}><For each={providers()}>{provider => <a href={`/auth/oidc/${provider}/`}>{t().login}: {provider === 'google' ? 'Google' : 'Microsoft'} ↗</a>}</For></nav></Show>
          <Show when={!signedIn()}><nav class="knaba-access-links" aria-label={t().title}><button type="button" disabled={pending()} onClick={() => change('request')}>{t().request}</button><button type="button" disabled={pending()} onClick={() => change('invite')}>{t().invite}</button><button type="button" disabled={pending()} onClick={() => change('forgot')}>{t().forgot}</button></nav></Show>
        </Match>
        <Match when={mode() === 'request' || mode() === 'invite'}>
          <p>{mode() === 'request' ? t().requestIntro : t().inviteIntro}</p>
          <form class="knaba-access-form" onSubmit={submit} aria-busy={pending()}>
            <Show when={mode() === 'invite'}><label>{t().token}<input name="token" type="password" autocomplete="off" value={token()} onInput={event => setToken(event.currentTarget.value.trim())} required minLength={43} maxLength={43}/></label></Show>
            <label>{t().name}<input name="name" autocomplete="name" required minLength={2} maxLength={160}/></label>
            <label>{t().email}<input name="email" type="email" autocomplete={mode() === 'invite' ? 'username' : 'email'} inputmode="email" autocapitalize="none" spellcheck={false} required maxLength={320}/></label>
            <Show when={mode() === 'request'}><label>{t().choose}<select name="intent" required value={selected() === 'admin' ? 'client' : selected() ?? 'client'}><For each={accountRoles.filter(item => item !== 'admin')}>{item => <option value={item}>{t()[item]}</option>}</For></select></label><input name="website" type="text" class="knaba-access-honey" tabIndex={-1} autocomplete="off" aria-hidden="true"/></Show>
            <Show when={mode() === 'invite'}><label>{t().newPassword}<input name="password" type="password" autocomplete="new-password" required minLength={8} maxLength={256}/></label><label>{t().confirm}<input name="password_confirm" type="password" autocomplete="new-password" required minLength={8} maxLength={256}/></label></Show>
            <label class="knaba-access-check"><input name="privacy" type="checkbox" value="on" required/><span>{t().privacy} <a href={privacy()} data-astro-reload>{t().privacyLink} ↗</a></span></label>
            <button class="knaba-access-primary" type="submit" disabled={pending()}>{pending() ? t().working : mode() === 'request' ? t().request : t().invite}</button>
          </form>
          <nav class="knaba-access-links" aria-label={t().title}><button type="button" disabled={pending()} onClick={() => change('login')}>{t().back}</button></nav>
        </Match>
        <Match when={mode() === 'forgot'}><p>{t().recover}</p><a class="knaba-access-primary" href={contact()}>{t().contact} →</a><nav class="knaba-access-links" aria-label={t().title}><button type="button" onClick={() => change('login')}>{t().back}</button></nav></Match>
      </Switch>
    </div>
  </dialog>;
}
