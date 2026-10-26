# KNABA ERP QA runtime (not production)

The ERP unit suite includes real PDF/XLSX/CSV roundtrip tests in `tests/resources.test.ts`. Six cases previously failed on a minimal `node:24-bookworm-slim` image **before** exercising their assertions because the image lacked `python3`, `openpyxl`, `Pillow` and `pdftotext`. All four dependencies are **test tooling only**. Do not add them to the ERP runtime or infer that passing them validates commercial/legal documents.

Build the disposable QA image (only for an approved, isolated test runner):

```bash
cd erp
docker build --pull=false -f infra/qa/Dockerfile -t knaba-erp-qa:local infra/qa
```

Verify runtime dependencies, then run the focused independent file-format tests from a **clean isolated checkout** that has already installed the exact `package-lock.json` dependencies (do not use another repo's live working directory):

```bash
docker run --rm --network none --cpus=2 --memory=2g --pids-limit=180 \
  --tmpfs /tmp:rw,size=192m \
  --mount type=bind,src="$PWD",dst=/work \
  -w /work knaba-erp-qa:local sh -ec \
    'node -v; python3 -c "import openpyxl,PIL; print(openpyxl.__version__,PIL.__version__)"; pdftotext -v; ./node_modules/.bin/vitest run tests/resources.test.ts'
```

For the full CPU suite, replace `vitest run tests/resources.test.ts` with `vitest run`. With `DATABASE_URL` unset, PostgreSQL tests are **SKIPPED/NOT_RUN**; never count them as PASS. Full SQL verification requires a separate *synthetic* PostgreSQL 17+ instance on a private Docker network, no forwarded ports, a bounded temporary volume/tmpfs, secrets only in ephemeral environment variables, and independent restore/QA. Never use production `DATABASE_URL`.

To reproduce the build on an exact code SHA in a disposable checkout (not production), supply `GIT_SHA` externally from `git rev-parse HEAD`, use `KNABA_BUILD_CONTEXT=PINNED_SOURCE`, and run `npm run build` with sufficient bounded CPU/RAM and a finite timeout. If `vite build` times out, mark BUILD **NOT_VERIFIED**; `tsc --noEmit` is not a build receipt. Observe elapsed time and peak memory before changing Vite source/config. Hash actual `dist/*` artifacts only after exit 0.

This Dockerfile intentionally has no customer/AI/Telegram credentials or database. Its base tags and Debian package versions are not immutable digests; record the actual resolved image ID, Node/Python package versions, commit SHA, test command and outputs for every accepted QA run. Source-tree edits, network provider activation, PR merge and deployment still require their separate gates.

**Verified preflight (2026-10-25):** on source `8d7f5530067ddead1164b26ff4cc7a45f65e6e04` the ephemeral recipe's equivalent image used Node `24.22.1`, Python `3.12`, `openpyxl 3.1.5`, `Pillow 11.3.0`, `pdftotext 25.03.0`; `tests/resources.test.ts` completed **68/68 PASS**. This proves the focused test only, not full ERP release readiness.
