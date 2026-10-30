# KNABA — six-language translation source

The current user-approved language scope is exactly **Deutsch, English, Polski, Lietuvių, Русский, Українська**, in that order. German remains the default. `src/lib/locale-catalog.ts` is the authority; the earlier broad target inventory is superseded by the 2026-10-28 request.

Publication is route-specific. The home, services overview, contact, planner, FAQ, company overview, app entry, WhatsApp entry and Telegram entry have genuine versions in all six languages. The existing DE/EN/RU/UK detailed routes are preserved. PL/LT specialist, gallery and legal links that still use German have visible **DE** labels. `/languages.json` includes the actual translated paths; neither the language menu nor `hreflang` invents missing equivalents.

Portal and workspace dictionaries live in `src/data/portal-locales/*.json`. German is available without a language request; other languages are content-addressed same-origin JSON assets, loaded only when selected. Key/shape validation, request deduplication and failure recovery keep the previous language usable. Business records and authorization rules are never translated or changed by choosing a language.

## Safe workflow

1. After a successful build: `npm run i18n:extract`. This creates versioned `i18n/source-de.json` from the current German public route inventory, German legal pages and public account entry. Repeated German text is deduplicated by a deterministic ID; any source change changes SHA256.
2. The historical draft tool remains available for an explicitly approved future expansion; there are no pending target languages under the current six-language scope. It does not enable languages, publish routes or use paid providers.
3. Add translations keyed by IDs, plus independently reviewed brand descriptor, slogan and SVG description. Preserve placeholders. Do not include customer data, executable markup or false license claims.
4. Use npm run i18n:report and npm run i18n:verify; npm run verify:build checks source version drift.
5. Even 100% static unit coverage is NOT publish approval. Native language, legal text, public forms and errors, KNABA Assistant, account flows, SEO, RTL, 320/390/768/1440 and keyboard/screen-reader/device QA remain independent blockers.

## Hard boundaries

The extracted static HTML excludes client-side Solid/Vue text, Assistant chat/voice, dynamic validation, customer portal operations, Studio/ERP, and native legal review. The pipeline does not translate these automatically. Draft resources are never public URLs, hreflang or sitemap entries. No external AI/translation API is called; EUR 0 external translation spend, cost/quotas unknown.

Existing `AGENTS.md`, current `PROJECT_MEMORY.md` and `ROADMAP.md` retain their security and release boundaries. `docs/I18N_99_ROLLOUT_UK.md` is historical evidence, superseded for language scope. Translation terminology is in `TRANSLATION_GLOSSARY_UK.md`. Static text parity is not evidence of native-language, physical-device or legal acceptance.
