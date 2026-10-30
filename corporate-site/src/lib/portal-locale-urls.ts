// Vite emits these as content-addressed JSON assets, not executable bundles.
import en from '../data/portal-locales/en.json?url';
import pl from '../data/portal-locales/pl.json?url';
import lt from '../data/portal-locales/lt.json?url';
import ru from '../data/portal-locales/ru.json?url';
import uk from '../data/portal-locales/uk.json?url';
export const portalLocaleUrls={en,pl,lt,ru,uk} as const;
