# KNABA-GUIDE-TOOLS — practical preparation and printing

Source: owner «продовжуй», continuing the construction-cleaning site audit.
Base: 7590f15db7e1590afe6eaef1388f1963a5042b66; live executable confirmed
2026-10-25T14:02Z: 5b5261e56ad4ae5122495cf3e9b0f87ea7f2d70c.

The current five-item lists show completed green ticks before the visitor has
prepared anything. Articles have no print layout, and service preparation links
only open the generic guide index. Improve this existing visitor journey.

| ID | Acceptance | Owner / evidence |
| --- | --- | --- |
| TOOLS-1 | All 16 guides start with five labeled unchecked native checkboxes, mouse/keyboard operable and readable at 320px/200%; explain that marks are not included in an enquiry | root; browser |
| TOOLS-2 | Localized print button progressively enhanced; browser print/PDF contains article and marked checklist, readable without site menus/widget/related cards; normal screen unchanged after printing | root; Chromium print emulation, generated PDF inspected locally |
| TOOLS-3 | Core service preparation lists link directly to curated relevant articles in the same language; special services retain general guidance; all links resolve | root; route checks + browser |
| TOOLS-4 | Independent review, repository gates, current-release guard, immutable dev release/backup/rollback and live verification | continue_audit reviewer; exact SHA / artifact receipts |

No new runtime services, dependencies, stored visitor data, form submission or
auth/database changes. No public Git push (previous automatic review rejected it),
main merge, official knaba.de deployment, paid provider or external messages.
Existing auth/Studio/planner PRs are separate work. User authorization already
covers this development domain. Refresh current release immediately before any
remote write or deployment and preserve concurrent changes. Native browser/PDF
testing does not establish physical device, printer, owner or real lead delivery
acceptance. Canonical memory/roadmap updated after actual checks.
