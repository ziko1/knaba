# KNABA source provenance and migration composition repair

**Goal:** remove the false immutable-current-ERP gate and compose PR67 bridge plus PR58 owner enrollment without silently replaying applied migrations.
**Architecture:** preserve the original import commit/tree evidence; classify clean committed feature evolution separately. Keep bridge migration 0005 unchanged; add owner onboarding at 0006 in the new source-only candidate. Fail closed on unknown migration-ledger identities/checksum drift before applying any pending SQL. No production action.
**Stack:** existing Node24, built-in node:test/node:sqlite, existing Git and corporate/ERP dependencies; no new packages.
**Inputs:** PR41 49c4db1b94cf9c7265512cd9bd8d1e972f2597de, PR67 3e76dec480a87dc9314c267deb78eb86925f4baa, PR58 41e91d4e972a3e5d847cfd569f83b2e91979cb9c. Main remains unchanged.

## Constraints and decisions
- KNABA only. Existing UI branches and active preview are not overwritten; this candidate is not an approved replacement for a newer live site.
- Original import anchor 66b07fb46d23c7110473c51fc23ce58d3c40a1b1 and tree hashes stay immutable. Feature changes never claim byte-identical import.
- No release gate, original migration SQL or applied ledger is rewritten. An alternate historical 0005_owner_invite ledger requires separate reviewed migration reconciliation, not an automatic alias.
- Synthetic temporary databases only. No secrets, live DB reads/writes, external dispatch, paid provider calls, merge/main/deploy.
- Run inline; no verified subagent dispatch/budget available. Independent review remains NOT_RUN unless genuinely obtained.

## Tasks
- [x] TDD historical import/current source separation; dirty/staged/untracked/missing paths and metadata fail closed.
- [ ] Separate PR67-based worktree for selectively ported PR58 owner code and migration repair; preserve PR41 site/ERP and all original branches.
- [ ] TDD real SQLite migration fresh/upgrade/replay/checksum/alternate-ledger behavior; complete SQL journal/custom snapshot at 0006.
- [ ] Run targeted and available complete module checks; preserve source-bound stdout/stderr and report unavailable scopes.
- [ ] Commit, publish Draft candidate, read back exact Git tree and archive evidence. Release stays blocked until separate acceptance/approval.

## Review focus
Historical anchor ancestry; arbitrary current changes must be visible not auto-accepted; pending SQL must not run before ledger validation; old SQL bytes/receipt timestamps must remain unchanged on upgrade; full owner/bridge integration and rollback must not be inferred from schema compatibility.

## Ruling after source inspection
A wholesale PR67 site replacement would change 295 files and delete the PR41 voice/owner conversation components. It was inspected only in this isolated index and restored without commit. Keep two focused repairs on their existing source lines instead of claiming an unreviewed feature-preserving combined product. Root repair: 15 source + 5 release-policy cases PASS; runtime and independent integration acceptance remain separate.
