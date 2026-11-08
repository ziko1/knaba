-- Forward-only runtime compatibility marker for F2 session revocation semantics.
-- A pre-F2 VPS binary must refuse this recognized-in-current-only ledger entry
-- before reading cookies. No table, user, credential, role or data is changed.
-- Roll back with a compatible binary or an independently verified backup.
SELECT 1;
