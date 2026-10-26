# KNABA I18N-99 — versioned translation source

The existing locale-catalog.ts remains the single authority for published languages: DE/EN/UK/RU are public, 95 others are pending.

## Safe workflow

1. After a successful build: npm run i18n:extract. This creates the versioned i18n/source-de.json from 22 sitemap-published German pages, the two German legal pages and the public account entry. Repeated German text is deduplicated by a deterministic ID; any source change changes SHA256.
2. Create a single unreleased draft: npm run i18n:draft -- fr. It creates i18n/drafts/fr.json once and refuses overwrites. It never activates a route or paid provider.
3. Add translations keyed by IDs, plus independently reviewed brand descriptor, slogan and SVG description. Preserve placeholders. Do not include customer data, executable markup or false license claims.
4. Use npm run i18n:report and npm run i18n:verify; npm run verify:build checks source version drift.
5. Even 100% static unit coverage is NOT publish approval. Native language, legal text, public forms and errors, KNABA Assistant, account flows, SEO, RTL, 320/390/768/1440 and keyboard/screen-reader/device QA remain independent blockers.

## Hard boundaries

The extracted static HTML excludes client-side Solid/Vue text, Assistant chat/voice, dynamic validation, customer portal operations, Studio/ERP, and native legal review. The pipeline does not translate these automatically. Draft resources are never public URLs, hreflang or sitemap entries. No external AI/translation API is called; EUR 0 external translation spend, cost/quotas unknown.

Existing AGENTS.md, PROJECT_MEMORY.md, ROADMAP.md and docs/I18N_99_ROLLOUT_UK.md remain authoritative. Translation terminology is in TRANSLATION_GLOSSARY_UK.md.
