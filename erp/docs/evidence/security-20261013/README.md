# KNABA DE — dependency security verification, 2026-10-13

Base: b2c1d8f2926a9ebe4ea443e1865e6b57f093defb. Candidate: 71df6901b1cd2b7fe6032bdd1ef1e8b986d3cbd9. Only package.json/package-lock.json changed. No app, test, auth, approval, or deploy rules were edited. Node 24.19.0, npm 11.9.0, Linux x64.

## Change

- Nest common/core/platform-express 11.1.6 → 11.2.7; Express 5.1.0 → 5.2.1. This retains Nest11 and deduplicates Express while installing patched multer2.4.0/path-to-regexp8.4.2/file-type.
- AWS S3 SDK 3.899.0 → 3.1150.0, retaining public v3 S3 API. Vulnerable fast-xml-parser leaves the resolved tree.
- sharp 0.34.4 → 0.35.5 for upstream native security fixes; verified loaded librsvg2.63.2/libvips8.18.7. Node24 satisfies new >=20.9.0 engine requirement. Existing code does not use removed failOnError/paletteBitDepth/sharpen properties or jp2k format key.
- Vite7.1.7 → 7.3.7; Vitest3.2.4 → 4.1.11. A supported Vitest4 patch is required: official advisory explicitly says 3.x has no mocker fix, and 3.2.7 still depends on vulnerable tinypool1.x. Vitest4 removes tinypool entirely. No overrides or audit suppression.

## Reachability assessment

- sharp: untrusted uploaded bytes reach sharp(...).metadata() before detected-format validation in packages/storage/media-ingest.ts and apps/api/http.ts. Therefore caller-provided image/jpeg/png/webp MIME alone must not be considered a protection against decoder flaws. Actual exploit/RCE was NOT attempted or established. Patch removes flagged library versions.
- AWS XML: production S3 adapter is reachable only when explicitly configured; parsing is on configured provider responses. No direct user XML parsing path found in app source. XML dependency was nonetheless patched by SDK update. Real S3 service acceptance NOT_RUN.
- Nest: HTTP router is active; potential path-to-regexp risk depends on registered path shape. No application Nest SSE decorators/streams, FileInterceptor or FileTypeValidator usage found; multipart/file-type advisories are installed dependency exposure without demonstrated application entry point. Patch removes vulnerable versions instead of relying on that inference.
- Vite/Vitest/tinypool are development dependencies. Production starts built server.mjs. The Vite config explicitly binds dev server 0.0.0.0, so dev-server advisories cannot simply be dismissed if it is exposed. No production Vite/Vitest service was proved. Linux is unaffected by Windows-only path variant; broader dev advisories still justify patch.

## Primary sources consulted

- https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w
- https://sharp.pixelplumbing.com/changelog/v0.35.0/
- https://github.com/nestjs/nest/security/advisories/GHSA-36xv-jgw5-4q75
- https://github.com/pillarjs/path-to-regexp/security/advisories/GHSA-j3q9-mxjg-w52f
- https://github.com/expressjs/multer/security/advisories
- https://github.com/NaturalIntelligence/fast-xml-parser/security/advisories/GHSA-m7jm-9gc2-mpf2
- https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff
- https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9
- https://github.com/vitest-dev/vitest/releases/tag/v4.1.11
- https://github.com/tinylibs/tinypool/security/advisories/GHSA-85c8-ppgw-ccpr

## Limits

Zero npm audit findings is a registry snapshot, not proof the complete application is secure/production-ready. Dependency update must pass final integrated PostgreSQL/browser/container/restore/worker/native and provider gates before release. Existing jpeg-exif1.1.4 and crypto-js4.2.0 emit deprecation notices; neither is presently flagged by this audit. No pushes, deployments or external paid calls were made by this worker. Rollback is reverting the package commit; doing so reintroduces the baseline advisories. Root owns roadmap/memory integration and independent review.

## Final verification

- Clean committed SHA 71df6901b1cd2b7fe6032bdd1ef1e8b986d3cbd9.
- npm ci --no-audit: exit0. npm ls --all --json: exit0.
- npm audit --json: baseline exit1, 30 findings (21 moderate,6 high,3 critical); candidate exit0, zero findings.
- npm run build: exit0 including tsc --noEmit, Vite7 production assets and immutable server/worker bundle. Vite transform/build took3m30s. Single JS asset647.54kB/205.45kB gzip produces retained chunk-size warning.
- npm test -- --maxWorkers=2 --reporter=json --outputFile=/tmp/knaba-security-evidence/tests.json: exit0, 90 files,1821PASS,421SKIP/NOT_RUN,0FAIL. Whole suite retains original tests.
- dist/release.json records exact SHA and source_dirty=false.

Raw receipts/hashes in summary.json and SHA256SUMS.json.
