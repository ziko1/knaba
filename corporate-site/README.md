# KnaBa corporate website — temporary preview

German corporate cleaning website for KnaBa, Berlin & Brandenburg. Temporary address: `https://kneba.vsp.rest`. Official existing website: `https://knaba.de`. This is an isolated marketing surface in `ziko1/knaba`; the KNABA V4 application is preserved.

## Run and verify

Node >=22.23.4 (tested Node24.19.0).

```sh
npm ci
npm run check
npm test
npm run build
npm run verify:build
npm run preview
```

## Architecture

| Technology | Actual responsibility |
|---|---|
| Astro7 + Vite | Static routing/prerender and one build pipeline |
| SolidJS | Inquiry wizard and query-backed catalogue |
| Vue3 + Pinia | Service finder and local object/need filters |
| Svelte5 | Preparation checklist, progress/reset, inquiry handoff |
| Zustand vanilla | Shared validated service selection among planner islands |
| TanStack Solid Query | Local catalogue request, cache, timeout/cancellation/error/retry |
| Tailwind CSS4 | Tokens, utilities and responsive planner layout |
| TypeScript | Contracts and Astro/Vue/Svelte checks |
| Vitest | Planner rules, state isolation, catalogue boundary tests |

Svelte was selected from the requested Svelte/SvelteKit alternatives; Vite was selected from Vite/Turbopack. SvelteKit and Turbopack are not installed or claimed integrated. Do not add a second router or unused builder to this Astro project.

16 prerendered HTML pages, six service details, local catalogue JSON and sitemap. Homepage is fully static with no framework islands. Only `/planer/` loads the three interactive frameworks; `/kontakt/` loads the Solid inquiry. No external fonts/images, analytics, localStorage or personal-data persistence. Original SVG illustration is symbolic, not a KnaBa reference project.

The inquiry **prepares an email draft**; it does not send or create a server Lead. Planner transfers the service via a validated query parameter. Checklist checkmarks intentionally remain on the planner, as explained on screen.

## Temporary hosting

Every page labels the temporary preview and remains noindex/nofollow; robots disallows crawling. Domain constants live in `src/data/site.ts` and `astro.config.mjs`. `public/_headers` requests noindex and basic headers; live host behavior must be verified separately. DNS and removal/migration instructions are in `docs/TEMPORARY_HOSTING.md` once deployment is verified. No automatic expiry or deletion has been scheduled.

Final legal/operator review, human UAT, real Lead delivery and field Web Vitals remain future official-release work. Temporary-public access is explicitly authorized by the user on 24 October 2026. No changes to official knaba.de or vsp.rest apex are part of this scope.

- [Audit](docs/SOURCE_AUDIT.md)
- [Plan and expanded prompt](docs/PLAN_AND_PROMPT_UK.md)
- [Revision2 acceptance and architecture](docs/REVISION_2_PLAN_UK.md)
- [Roadmap](ROADMAP.md)
- [Memory](PROJECT_MEMORY.md)
