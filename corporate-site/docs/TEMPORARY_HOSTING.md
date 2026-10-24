# Temporary hosting and retirement

Purpose: public design/functionality preview explicitly requested by the owner, 24 October 2026. Target `https://kneba.vsp.rest`; official existing site remains `https://knaba.de`.

- Isolated Sites project: `appgprj_6adc346d6f8881918b73ac79ebc5d759`
- Provider origin allocated: `https://kneba-temporary-preview.just-fawn-8470.chatgpt.site` (allocation alone is not a successful deployment)
- Cloudflare zone: `vsp.rest`, `d7af78fe0b9a0e7ec2e113d6791c102e`
- Account: `4492752f516dfe77fa8aacb5b106baf9`
- Before changes: no records at kneba.vsp.rest, wildcard *.vsp.rest, _openai-site-verification.kneba.vsp.rest or _acme-challenge.kneba.vsp.rest. Existing apex project and mail left untouched.
- Actual source/version/deployment/domain/DNS receipts: append after successful publication.

## Temporary behavior

Visible header/footer notice, official-site link, self-canonical on temporary hostname, robots disallow and meta noindex/nofollow. No automatic expiry/deletion job. `_headers` is a requested static-host configuration; verify actual HTTP behavior before claiming it enforced. Noindex is not authentication.

## Retirement, only after a future explicit instruction

1. Read this project's current domain binding and exact DNS IDs from receipts. Verify their hostname/content still match this preview; stop if someone changed them.
2. Preserve source, last built artifact digest and rollback version.
3. Delete only the newly created preview CNAME and validation records. Do not touch apex, www, mail, wildcard, official knaba.de or unrelated sites.
4. Remove only kneba.vsp.rest binding from this project, then change preview to owner-private. No site deletion/unpublish API was exposed at discovery; do not claim data erased.
5. Verify domain no longer serves preview and official site still resolves. DNS caches may continue serving old routing until TTL expiry.

## Future official-domain migration, separate release

Confirm approved legal/operator details and brand content; integrate real Lead delivery if desired; obtain access and explicit authorization for knaba.de. Change site origin and build/site configuration together. Prepare old URL redirects (/ber, /jobs, /galerie), reviewed sitemap/canonical and consent/privacy requirements. Preview and verify exact artifact before DNS cutover; retain old official deployment for rollback. Remove noindex only on the approved official release. Retire kneba.vsp.rest after successful cutover per instructions above, or keep an explicitly approved redirect.

## Publication receipts

- Source commit (Sites repository): `35103e5ee177f593951f52b451ad94a59b3efe13`
- Saved version: `appgprj_6adc346d6f8881918b73ac79ebc5d759~appgver_c0751056dc48819183d53eca8719e988` (v1)
- Deployment: `appgdep_6adc36dc9030819184b7d0ea8d2eba22`, succeeded, 2026-10-24T04:41:15Z
- Archive content hash: `sha256:5fd6b90b560ed4392095c21d1852ff5dc1f4a5ac093953481e0b9a80f3a742fb`
- Deployed dist digest: `dcec10a0fb7e628e64e0f8c0a90449b2ea2eb0dad5747a5cda1f71b057607436`
- Domain binding: `appgdom_6adc36f5e01c819198f00c482cf3a16a`

| Created DNS record ID | Type | Hostname | TTL |
|---|---|---|---|
| 718b0fe10fe1654872cc795125ba46a7 | CNAME | kneba.vsp.rest → custom-domains.chatgpt.site | 300 |
| 3976b2413261bd3b16e0802ad41b377b | TXT | _openai-site-verification.kneba.vsp.rest | 300 |
| 287be2f71309f901bbc794dad2712977 | TXT | _cf-custom-hostname.kneba.vsp.rest | 300 |

CNAME is DNS-only (proxied=false). All three records carry a temporary/removal comment. Full public validation values are provider-controlled and should be read from the exact record at removal; do not reconstruct them. A first create attempt was rejected for a comment over100 characters; shorter comment succeeded, with no records created by the failed attempt.

The packaging checkout rebuilt the same41 source/config/test files. Differences from local-build HTML were only Astro-generated island UID attributes in contact/planner; all emitted JS and CSS matched. `docs/evidence/deployed-build-verification.json` binds the exact archive build.

Provider-origin browser render passed. Executor HTTP requests to that origin returned403; they are not evidence of a website outage because the real browser rendered it. Raw response-header enforcement and byte-for-byte public HTTP comparison remain unverified through that executor.

## Verified domain outcome

24.10.2026, about06:44 Europe/Berlin: custom domain, provider and TLS all `active`. Browser opened `https://kneba.vsp.rest/`, rendered the intended final design, meta robots `noindex, nofollow`, canonical `https://kneba.vsp.rest/`, final CSS hash `Layout.CdcVcV3Q.css`. Live Vue selection→Svelte checklist→query-preselected Solid inquiry passed; live TanStack catalogue loaded and Solid selection changed shared state to Glasreinigung. Source/version receipts and screenshot: `docs/evidence/revision2-live.json`, `revision2-live.jpg`. No automatic deletion is scheduled.
