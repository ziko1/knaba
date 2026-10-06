# KNABA DE Android

Actual Kotlin application, package `de.knaba.mobile`, min API 26 / compile and target API 36. Java 17, Gradle 8.13, Android Gradle Plugin 8.13.0, Kotlin 2.2.20 are pinned. No boot receiver, no sticky hidden GPS restart, no background-location permission. Location foreground service starts only from a visible activity after explicit activation. Android Keystore AES-GCM protects device credentials and the ordered durable offline queue.

Install Gradle 8.13 and Android SDK 36 then run `gradle --no-daemon :app:assembleDebug` from this directory. Production signing must use KNABA DE-controlled stable key; no fabricated release signing is included. Run `apksigner verify --print-certs app/build/outputs/apk/debug/app-debug.apk`, record SHA-256 and install on a physical approved test device. See `docs/MOBILE.md` for contract and field tests. Build and physical tests remain NOT_RUN until the recorded checks actually execute.
