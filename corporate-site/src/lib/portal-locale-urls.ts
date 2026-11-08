// Vite emits these as content-addressed JSON assets, not executable bundles.
import de from '../data/portal-locales/de.json?url&no-inline';
import en from '../data/portal-locales/en.json?url&no-inline';
import pl from '../data/portal-locales/pl.json?url&no-inline';
import lt from '../data/portal-locales/lt.json?url&no-inline';
import ru from '../data/portal-locales/ru.json?url&no-inline';
import uk from '../data/portal-locales/uk.json?url&no-inline';
export const portalLocaleUrls={de,en,pl,lt,ru,uk} as const;
