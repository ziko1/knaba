# KNABA native 0.5.0 — exact-source acceptance

Source `fb4be719fc6f777138cb93837fc41729f9104c09`; [Draft PR127](https://github.com/ziko1/knaba/pull/127). [Native CI](https://github.com/ziko1/knaba/actions/runs/42463090142): Android 32 and actual iOS 49 tests pass. [Repository CI](https://github.com/ziko1/knaba/actions/runs/42463090119): all 4 mandatory jobs pass, including 2739 ERP tests with PostgreSQL 17.6 and 9 HTTP bridge cases. The conditional failure-summary job is correctly skipped.

Receipts are preserved by execution: local Android and hosted Android have different debug signing keys and APK hashes. iOS artifact is an unsigned Simulator application with XCTest, not an installable IPA. Its embedded preparation receipt precedes testing; final XCTest result is in ios-xctest-summary.json.

Independent source/artifact review checked all 53 Android input files plus 1 shared vector, all 40 iOS archive inputs against exact Git blobs, and the 49-test summary/app archive hash. Local packaging tests rejected four tampered/wrong-signature AAB cases. Raw log digests and precise remaining acceptance boundaries are in verification.json.

Physical devices, owner signing/UAT, complete role workflows and whole-system requirements remain open. Full product NOT_READY. A later documentation-only commit does not retag these artifacts.
