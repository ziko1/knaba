# KnaBa unified release evidence workspace

This is a **future** evidence path, not proof of production acceptance. Only reviewed, non-secret, PII-redacted, source-bound JSON receipts may be committed here. No provider credentials, customer messages or private data.

The `scripts/verify-release-readiness.mjs` check requires every gate's local evidence file SHA256 to match the receipt and checks Git SHA and explicit owner-approval flag. This is necessary but NOT sufficient for independent QA, legal, provider and customer UAT reviews.

A release remains BLOCKED until every recorded test or approval has real external evidence and separate authorized production deployment.
