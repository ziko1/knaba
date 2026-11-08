import type {PortalLocale} from './portal-i18n';

/** Local VPS controls; hosted identity-provider passwords stay external. */
export const accountSettingsLinks:Record<PortalLocale,{settings:string}>={
  de:{settings:'Kontoeinstellungen'},
  en:{settings:'Account settings'},
  pl:{settings:'Ustawienia konta'},
  lt:{settings:'Paskyros nustatymai'},
  ru:{settings:'Настройки аккаунта'},
  uk:{settings:'Налаштування облікового запису'}
};
