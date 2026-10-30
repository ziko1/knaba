import type { PortalLocale } from './portal-i18n';

/** Hosting selects only the sign-in UI; authorization remains server-owned. */
export function hostingAuthentication(mode: unknown = import.meta.env.PUBLIC_KNABA_AUTH_MODE) {
  const native = mode === 'sites';
  const returnPath = (value: string) => {
    if (!value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) return '/konto/';
    try {
      const url = new URL(value, 'https://knaba.invalid');
      if (url.origin !== 'https://knaba.invalid' || url.pathname.startsWith('//') || /^\/(?:signin-with-chatgpt|signout-with-chatgpt|callback|login|logout)(?:\/|$)/.test(url.pathname)) return '/konto/';
      return url.pathname + url.search + url.hash;
    } catch { return '/konto/'; }
  };
  return {
    native,
    passwordAccounts: !native,
    signIn: (path: string) => `${native ? '/signin-with-chatgpt' : '/login/'}?return_to=${encodeURIComponent(returnPath(path))}`,
    signOut: (path: string) => `${native ? '/signout-with-chatgpt' : '/logout/'}?return_to=${encodeURIComponent(returnPath(path))}`,
  };
}

/** Native identity and KnaBa role approval are separate steps. */
export const nativeSignInCopy: Record<PortalLocale, { button: string; text: string; note: string }> = {
  de: { button: 'Mit ChatGPT anmelden', text: 'Melden Sie sich mit ChatGPT an und reichen Sie Ihr KnaBa-Profil zur Freigabe ein. Neue Konten und Rollen werden vom Website-Inhaber geprüft.', note: 'Die Anmeldung erfolgt bei OpenAI. KnaBa erhält kein ChatGPT-Passwort; der Inhaber gibt den passenden Portalzugang frei.' },
  en: { button: 'Sign in with ChatGPT', text: 'Sign in with ChatGPT and submit your KnaBa profile for approval. The website owner reviews new accounts and roles.', note: 'You sign in with OpenAI. KnaBa does not receive your ChatGPT password; the owner approves the appropriate portal access.' },
  pl: { button: 'Zaloguj się przez ChatGPT', text: 'Zaloguj się przez ChatGPT i prześlij profil KnaBa do zatwierdzenia. Właściciel strony sprawdza nowe konta i role.', note: 'Logowanie odbywa się w OpenAI. KnaBa nie otrzymuje hasła do ChatGPT; właściciel zatwierdza odpowiedni dostęp do portalu.' },
  lt: { button: 'Prisijungti per ChatGPT', text: 'Prisijunkite per ChatGPT ir pateikite KnaBa profilį patvirtinti. Svetainės savininkas peržiūri naujas paskyras ir vaidmenis.', note: 'Prisijungiate per OpenAI. KnaBa negauna jūsų ChatGPT slaptažodžio; savininkas patvirtina atitinkamą prieigą prie portalo.' },
  uk: { button: 'Увійти через ChatGPT', text: 'Увійдіть через ChatGPT і подайте профіль KnaBa на підтвердження. Власник сайту перевіряє нові акаунти та ролі.', note: 'Вхід відбувається в OpenAI. KnaBa не отримує пароль ChatGPT; відповідний доступ до кабінету надає власник.' },
  ru: { button: 'Войти через ChatGPT', text: 'Войдите через ChatGPT и отправьте профиль KnaBa на подтверждение. Владелец сайта проверяет новые аккаунты и роли.', note: 'Вход выполняется в OpenAI. KnaBa не получает пароль ChatGPT; нужный доступ к кабинету предоставляет владелец.' },
};
