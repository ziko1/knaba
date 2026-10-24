# KnaBa corporate website candidate

Astro 7 + TypeScript + SolidJS. A separately buildable marketing surface in `ziko1/knaba`, based on user-confirmed `knaba.de`. It does not replace the existing KNABA V4 application or modify its pending branches.

## Run

Node >=22.23.4 (tested on Node 24.19.0).

```sh
cd corporate-site
npm ci
npm run check
npm test
npm run build
npm run verify:build
npm run preview
```

15 prerendered pages, including six service pages and the 404 page. Only the inquiry assistant uses a SolidJS browser island. The marketing pages remain readable without JavaScript. Contact details and services are centralized in `src/data/company.ts`.

The inquiry assistant **prepares an email draft**. It does not create a server-side Lead, send a message or claim delivery. No tracking, remote fonts, external image requests or personal-data storage are included. The image is illustrative, not a client reference.

## Release boundary

This candidate is deliberately **noindex** and `robots.txt` disallows crawling. The legal/privacy pages clearly remain drafts. No domain or production deployment has been changed. Before production: obtain owner approval, verify legal content and image provenance/licensing, confirm hosting/privacy requirements, approve redirects, remove the index block in the reviewed release, activate the prepared sitemap, and verify the deployed artifact plus real user flows. Actual email delivery, field Web Vitals and full accessibility certification are not claimed.

The existing application's KNB-21 / AC-62 Lead integration is a separate follow-up requiring real API contracts and endpoint access. No guessed endpoint or credential is embedded.

- [Audit](docs/SOURCE_AUDIT.md)
- [Plan and expanded Ukrainian prompt](docs/PLAN_AND_PROMPT_UK.md)
- [Roadmap](ROADMAP.md)
- [Project memory](PROJECT_MEMORY.md)
