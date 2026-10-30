import type {ConstructionOffer} from './construction-offers';

/**
 * First-party, decorative construction pictograms.
 * Fixed SVG paths only; no remote icon font, user content or runtime fetch.
 * Do not confuse the 'project' enquiry with a ninth company service.
 */
export const constructionIconPaths = {
  baureinigung:
    'M3 21h18 M5 21V8l7-5 7 5v13 M9 11h2v2H9z M14 11h2v2h-2z M9 21v-5h6v5',
  bauzwischenreinigung:
    'M4 20l10-10 M11 4l9 9 M7 17l-4 5 M4 19l3 3 M14 4l6 6',
  bauendreinigung:
    'M12 2l2.6 6.4L21 11l-6.4 2.6L12 20l-2.6-6.4L3 11l6.4-2.6L12 2 M19 17v5 M16.5 19.5h5',
  baustellenraeumung:
    'M3 9h18v9H3z M3 9l5 9 M9 9l5 9 M15 9l5 9 M6 18v3 M18 18v3 M6 5v3 M18 5v3',
  bauhilfe:
    'M4 14h16 M6 14v-2a6 6 0 0 1 12 0v2 M12 6v8 M7 18a5 5 0 0 0 10 0 M5 21h14',
  kernbohrungen:
    'M3 9h6l3-3h5v12h-5l-3-3H3z M17 12h4 M21 9v6 M6 12h3',
  durchbrueche:
    'M3 4h18v16H3z M3 10h18 M9 4v6 M15 10v10 M3 16h12 M15 16h6',
  zusatzarbeiten:
    'M21 7a5 5 0 0 1-7 5L6 20a2 2 0 0 1-3-3l8-8a5 5 0 0 1 6-7l-3 4 3 3 4-2z',
  project:
    'M9 4h2V2h4v2h2v3H9V4z M9 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1 M8 14l2 2 5-5 M8 19h8',
} as const satisfies Record<ConstructionOffer['slug'] | 'project', string>;

export type ConstructionIconName = keyof typeof constructionIconPaths;
export const constructionIconNames = Object.keys(constructionIconPaths) as ConstructionIconName[];
