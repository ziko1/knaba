# GitHub Actions і Codemagic — KNABA

## Поточний результат

**Codemagic реально зібрав Simulator app і виконав 19/19 XCTest: 0 failures, 0 skipped**, за **6 хв 18 с** на exact source `013a7851118dd6d8c420dabca5763148993835d1`. [Completed run](https://codemagic.io/app/6acbcd4a20e48927a17e4a6c/build/6acbcebc546ce6236ced9272). Raw summary та log підтверджують arm64 iPhone 16, iOS 18.5 / runtime 22F77, Xcode 16.4 / build 16F6; source receipt і simulator UUID збігаються. Незалежно звірені CRC/SHA-256 обох ZIP, app size/hash та всі **45 bundle-file hashes**.

`simulator-preparation.json` і його копія у native receipt є чесним знімком перед запуском XCTest та лишають `SIMULATOR_READY_XCTEST_NOT_RUN`. Пізніше виконання доводять незмінені `xctest-summary.json` і 19 passed case entries у `ios-tests.log`; підготовчий знімок не переписано.

Основний сервіс для публічного KNABA залишається GitHub Actions: Linux для backend/web/Android, macOS для iOS. Codemagic використовується лише як ручний резерв для наявного iOS Simulator suite, коли він потрібний. Це не друга автоматична копія всього CI.

## Як розподілені перевірки

| Перевірка | Основний workflow | Політика |
| --- | --- | --- |
| Typecheck/build, SQL/browser/restore/worker acceptance та artifacts | `.github/workflows/ci.yml` | `main` push, чинні tags, PR до будь-якої гілки, manual |
| Android debug/host Java/lint і iOS Simulator/XCTest | `.github/workflows/native.yml` | `main` push, чинні tags, PR до будь-якої гілки, manual |
| Responsive web smoke | `.github/workflows/responsive.yml` | `main` push та PR з попередніми path filters; manual |
| Isolated staging та V4 load | Наявні `staging.yml`, `v4-load.yml` | Без змін |

Feature-branch push більше не повинен дублювати PR verification. PR до робочої гілки у stacked chain залишається охопленим. Наявні concurrency groups, cancellation, timeouts, команди, permissions і artifacts збережено. GitHub dispatch доступний після появи відповідного workflow на default branch.

Нові GitHub jobs на конфігураційному SHA `111af6c6700213aa0b317675654ad7ea99784b77` були заблоковані до виділення runner: `runner_id=0`, жодного виконаного кроку. Це **BLOCKED_ENVIRONMENT / NOT_RUN**, а не падіння application assertions. На Codemagic-конфігураційному SHA `013a7851118dd6d8c420dabca5763148993835d1` GitHub навмисно не перезапускався через `[skip ci]` за чинного provider restriction. Політика events перевірена у source; hosted gates необхідно перевірити після відновлення GitHub execution.

## Ручний iOS запуск у Codemagic

1. Відкрити [KNABA у Codemagic](https://codemagic.io/app/6acbcd4a20e48927a17e4a6c) і почати build.
2. Вибрати branch `ci/balance-github-codemagic-20261011`, workflow `ios-simulator-tests`.
3. Перевірити exact checkout SHA у log/receipt, результат XCTest та artifacts; запускати за потреби, враховуючи спільний залишок безкоштовної квоти.

`codemagic.yaml` задає M2 та максимум 30 хвилин. Немає автоматичних triggers, publishing або secret groups. Image Xcode `'16.4'`, Simulator SDK/runtime `18.5`, iPhone 16 і XcodeGen source `7193eb447a6f60061f069e07bc1efd32d73c0e19` узгоджені з наявним GitHub native workflow. Реальні версія Xcode, доступний SDK, вибраний simulator UUID і source зберігаються в evidence.

Workflow виконує чинні `scripts/native-ios-simulator.py`, `apps/mobile-ios/scripts/build.sh` і наявний `xcodebuild ... test`. `set -euo pipefail` та cleanup trap зберігають тестовий exit status. Signing лишається `CODE_SIGNING_ALLOWED=NO`. Результат — Simulator `.app.zip`, `.xcresult`, test summary, source/device receipt і SHA-256/bundle hashes. Це не підписаний installable IPA.

## Межі приймання і джерело

[Draft PR #7](https://github.com/ziko1/knaba/pull/7) stacked поверх `codex/knaba-v4-recovery-20261011` / `c931fbe60a50d3a6193480cc9742d99fc6f3b714`. На конфігураційному source `013a7851118dd6d8c420dabca5763148993835d1` змінені лише три GitHub workflows та новий Codemagic YAML. App, dependencies, test source та native source збережено.

Останній спостережений [GitHub release run 38099583536](https://github.com/ziko1/knaba/actions/runs/38099583536) на попередньому `c931fbe6` завершився failure у `Real isolated SQL browser restore and worker restart acceptance`, packaging був skipped. Це окремий наявний результат, який цей CI patch не виправляє і не приховує. Старі accepted results у ledger лишаються прив'язаними до їхнього source.

Whole V4/V3 product залишається **NOT_READY**. Цей iOS запуск не приймає заново Android, PostgreSQL/backend/browser/load, фізичний GPS/батарею, company signing або live deployment. Documentation-only commit після тестів не підміняє exact tested SHA; `[skip ci]` не означає нового PASS. Межі чинної deployment authorization, cutoff і provider MFA не змінюються.

[Evidence](evidence/ci-balance-20261011/verification.json), [test ledger](TEST_EVIDENCE.md), [master roadmap](../MASTER_ROADMAP.md), [пам'ять](../PROJECT_MEMORY.md).

Офіційні довідки: [GitHub workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [Codemagic manual YAML builds](https://docs.codemagic.io/yaml-basic-configuration/yaml-getting-started/), [Codemagic Xcode 16.4 image](https://docs.codemagic.io/specs-macos/xcode-16-4/).
