# Final KNABA mobile test artifacts — 2026-11-08

Binary source: `2a9038e14d5dba47ba636556e905ae36144c266e`; tree: `303585bf7cec5e381a5908a20407c2cce4f067af`. The later commit containing this record changes documentation/evidence only and does not retag or rebuild these binaries.

The user requested customer-installable Android and iPhone files matching the website. The stored handoff is **partial**: an actual signed Android evaluation APK plus a ZIP containing that APK, an actual iOS Simulator application, exact iOS sources, UA/DE instructions, screenshots and original execution evidence. There is no signed iPhone device IPA. No customer sharing, phone installation, real ERP login or full-system acceptance is claimed.

| File | Bytes | SHA-256 |
|---|---:|---|
| KNABA-DE-Android-0.6.0-9.apk | 3,113,733 | `243d847a903d44754548c768793416e82fc881e63218e98ce9b4d664241a783c` |
| KNABA-DE-Test-Kit-0.6.0.zip | 14,713,526 | `2303d10b17882f35aceac78d36791f98e384e036297c945de05607fdb28f3939` |

Both requested saves succeeded and applied local identity metadata. Private download identifiers are intentionally omitted from this public repository. ZIP CRC, safe unique paths, all 149 file entries and 148 inventory hashes were verified against the reviewed directory. [Final byte verification](brand-final-delivery-integrity.json).

[Independent kit review](independent-kit-review.json) accepts evidence consistency on subject `851d9ad59c3fc926575d1c9bccb44d9bd503a49483011c7658647dd97d697044`, not full customer readiness. [Release gate](RELEASE_GATE.json): **EVIDENCE_INCOMPLETE — 2 PASS, 7 BLOCKED, 0 FAIL**. Referenced artifact paths inside the copied gate/reviews are relative to the delivered `KNABA-DE-Test-Kit-0.6.0/` archive, not this Git directory. The complete manifest, original logs, screenshots and binaries are in that archive; selected reports are copied here unchanged.

Actual native run: https://github.com/ziko1/knaba/actions/runs/42497195566 — Android 60/60 and iOS 91/91. Actual repository run: https://github.com/ziko1/knaba/actions/runs/42497195695 — root 30, site 1119, ERP/PostgreSQL 3000, HTTP bridge 82.

Android normal emulator install, installed-APK byte equality, process and resumed Activity passed. The screenshot retains a Pixel Launcher system ANR dialog, so unobstructed Android runtime visual acceptance is still open. iOS clean Simulator install/launch and bundle hash checks passed; that is not a physical-iPhone result. Public `erpOrigin` remained null at the recorded 15:58 UTC observation. Owner Apple distribution/signing, approved ERP/test accounts and physical/customer/full-system acceptance remain required.

No merge, production deployment, store submission or paid service activation was performed by this delivery checkpoint. Historical evidence below this directory remains bound to its original sources.
