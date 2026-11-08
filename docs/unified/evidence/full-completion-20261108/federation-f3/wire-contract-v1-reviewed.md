# F3 + мінімальний F4: wire contract v1 для review

**Статус: PROPOSED, implementation НЕ дозволена цим документом.**
Source baseline: `b3cbb24a33b5c9e677ae2db10fc29e506e8529a1` (accepted F2 `e03d2be` plus accepted media API classifier fix).
Worktree: `/workspace/scratch/c56161c95e04/knaba-federation-login`.
F2 dependency: прийнятий password-based contract; жодного OIDC/Sites adapter
або production/app-link ownership цей proposal не оголошує готовим.

## A. Незмінні поняття і числа

- `sourceIssuer`: exact existing F2 site authority issuer. `authorizationIssuer`:
  **ERP** issuer, server-owned `${erpOrigin}/auth/federation`; саме його перевіряє
  native callback `iss`. Не взаємозамінні.
- `requestId`: server UUID v4, non-authorizing handle. `requestBinding`: SHA256
  canonical immutable request tuple (company, authority, request, client, kind,
  platform, redirect, PKCE challenge, state hash, expiry, login-policy fingerprint).
- Pending login TTL **300s**, не поновлюється retry. Native code TTL **≤60s** і
  не пізніше pending expiry. Code format `K3C.` +43 random base64url characters;
  тільки domain-separated hash у DB. Одна успішна redemption.
- Issued ERP credential: **`KF3.` +43 random base64url characters**, звичайний
  `knaba_session` cookie, але обов’язкова immutable child authority row. Existing
  pre-F3 cookie/bearer regex відхиляє крапку. Missing child row = deny, не local fallback.
- Cookie lifetime **min(8h, source session expiry, binding expiry if present)**.
  Немає refresh token або автоматичного поновлення. Новий login — новий flow.
- Native PKCE: **S256 only**, challenge43 base64url; verifier43..128 RFC7636
  unreserved characters; щонайменше32 random bytes. State43 random base64url.
  `state` — bounded public correlation nonce, не bearer credential: pending row
  зберігає exact state для callback echo, а requestBinding містить його hash.
  Raw authorization code, verifier і KF3 credential у DB/receipt не зберігаються.
- Signed online source decision: `checkedAt`, `validUntil` із lifetime **≤10s**;
  future skew≤5s, source transport timeout3s, body/response≤32KiB. Немає cached allow
  між запитами. Після lock wait та перед завершенням SQL використовувати PG clock.
- Основний `knaba_session`: HttpOnly/Secure/SameSite=Strict без послаблення.
  Окремий handshake cookie `__Host-knaba-federation-flow`: HttpOnly/Secure,
  SameSite=Lax, Path=/, Max-Age≤300s; лише random nonce, у DB hash. Він не є ERP login.
  У явних HTTP TEST fixtures не стверджувати production cookie/browser ownership.

## B. Default-off конфігурація

ERP: окремий `SITE_FEDERATION_LOGIN_JSON`; відсутній/disabled = F3 unavailable,
навіть якщо F2 увімкнений. Existing F2 `policyVersion`/F1 trust fingerprint не
підвищується лише через додавання F3.

```json
{
  "enabled": true,
  "policyVersion": 1,
  "authorizationIssuer": "https://erp.example.invalid/auth/federation",
  "authorityIds": ["configured-f2-authority"],
  "clients": [
    {"clientId":"knaba-web-v1","kind":"WEB","platform":"WEB","label":"KNABA Web","returnPath":"/console"},
    {"clientId":"knaba-android-v1","kind":"NATIVE","platform":"ANDROID","label":"KNABA Android","redirectUri":"https://app.example.invalid/auth/knaba/android"},
    {"clientId":"knaba-ios-v1","kind":"NATIVE","platform":"IOS","label":"KNABA iOS","redirectUri":"https://app.example.invalid/auth/knaba/ios"}
  ]
}
```

Приклад — synthetic, не actual configuration. Кожний clientId унікальний; kind,
platform і safe text label (1..80 characters, без control characters) визначаються
registry, browser не задає їх. UI відображає label як text, не HTML. Native redirect порівнюється
як **exact string**, без wildcard/префіксів/відносного URL/fragment/userinfo.
Default production registry порожній; native entry не активується без перевірених
signing/team/domain app/universal links. Private-use scheme, якщо потрібний у TEST,
має окремий explicit test-only allowlist і не доводить ownership/MOBILE-003.
WEB returnPath — server fixed same-origin route, не довільний returnTo із browser.

VPS: окрема default-off login policy `{enabled, authorityIds, policyVersion}`
(env `KNABA_FEDERATION_LOGIN_JSON`), яка посилається лише на чинні F2 authorities.
Source enrollment/registry/P→L→C залишаються єдиними. Dedicated F2 directional keys
використовуються лише з новими явно дозволеними actions/purposes; intake/guest keys
не розширюються. Обидва policy fingerprints перевіряються; disabled/mismatch = deny.

## C. Browser/native HTTP endpoints

Усі input objects strict; невідомі company/user/role/device fields відхиляються.
У browser JSON routes exact Origin + flow CSRF; native token exchange не вимагає
site/browser cookie й авторизується одноразовим code + exact verifier.

| Endpoint | Input / binding | Result |
|---|---|---|
| `POST /api/v1/auth/federation/start` | WEB same-origin POST `{authorityId,clientId}` з exact Strict ERP cookie presence/hash pin; NATIVE `{authorityId,clientId,redirectUri,state,codeChallenge,codeChallengeMethod:'S256'}` без browser ERP session authority. Required `Idempotency-Key`8..200 printableASCII; durable start input hash, без generic command receipt | `200 {requestId,authorizationUrl,expiresAt}`; URL лише ERP `/auth/federation/authorize?request_id=<UUID>` |
| `GET /auth/federation/authorize?request_id=<UUID>` | Bounded valid CREATED request; bind once до new flow-cookie hash, не переприв’язувати інший browser | Minimal ERP consent/continue page; safe application/company labels; source link лише configured site route нижче |
| `GET /auth/federation/return?request_id=<UUID>` | Lax handshake cookie; handle сам не авторизує | Same-origin ERP continuation page; не створює session через GET |
| `GET /api/v1/auth/federation/requests/:id` | Exact flow cookie; поточний binding/ledger/policy | `{requestId,state,version,expiresAt,client:{clientId,kind,platform,label,redirectUri?},authorizationIssuer,callbackState?,companyLabel,erpUserLabel?,siteLabel?,requiresErpMfa?,csrfToken}`; private user/site labels/MFA лише після SOURCE_APPROVED; client.redirectUri та callbackState лише для NATIVE, із pinned pending/registry |
| `POST /api/v1/auth/federation/requests/:id/confirm` | Exact flow cookie + CSRF + `{expectedVersion,confirmed:true,otp?:sixDigits}`; WEB original optional ERP cookie presence/hash unchanged; online SESSION_ISSUE поза lock | WEB: existing login-shaped `{actor,user,mode,csrfToken,expiresAt}` + new Strict KF3 cookie. NATIVE: **200 JSON** `{requestId,state:'CODE_ISSUED',version,authorizationResponseUrl}`; browser ERP cookie не видається |
| `POST /api/v1/auth/federation/requests/:id/cancel` | Flow cookie + CSRF + `{expectedVersion}` | Minimal `{requestId,state:'CANCELLED',version}`; reduction-only, source outage не блокує cancellation |
| `POST /api/v1/auth/federation/token` | JSON `{grantType:'authorization_code',clientId,redirectUri,code,codeVerifier}`; exact native client/redirect/PKCE; **no** user/company/platform override; no cookie authority substitution | Existing login-shaped body + **Set-Cookie KF3** у native client's own cookie store; жодного deviceToken/refreshToken/GPS grant |

Token exchange — versioned first-party endpoint із стандартними authorization-code
і S256 checks, не оголошення загального OIDC provider/discovery server.

WEB account switching explicit: same-origin start фіксує exact ERP cookie presence
та hash (або явну відсутність). Current logout/replacement/appearance перед confirm
відхиляє старий attempt; callback не перезаписує новий ERP account непомітно.
NATIVE не використовує, не pin-ить і не переписує випадкову ERP session system browser;
окремі flow cookie та explicit account confirmation авторизують browser ceremony.
Cancel/logout поточного flow очищає handshake cookie. Cookie/session response не
надсилається до commit і final egress fence.

Для NATIVE confirm наш ERP UI перевіряє `authorizationResponseUrl`: exact registered
redirect base, рівно одноразові `code`, `state`, `iss` без duplicates/extra params,
expected `callbackState` та top-level `authorizationIssuer` зі status. Після цього
виконує top-level `location.assign`.
Fetch не намагається follow/manual-read cross-origin303. Raw URL/code не зберігається
в command receipts, history state, journal, analytics чи durable UI recovery.

Native callback містить лише одноразовий PKCE-bound code, state і **ERP** iss.
Cookie/device/access tokens, passwords, labels та PII до URL не потрапляють.
Code alone не redeemable без exact verifier. No-store, no-referrer, відсутність
analytics/private cache, query redaction у всіх наших logs/trace/crash surfaces.
Verifier — RAM або secure bounded pending state, не general command journal.
App перевіряє exact callback/client/state/issuer/original attempt до token call.
PKCE не доводить platform/domain ownership.

## D. VPS browser routes

| Route | Behavior |
|---|---|
| `GET /account/erp-login/?authority_id=<id>&request_id=<UUID>` | Safe landing без auth decision: cross-site navigation може не передати Strict site cookie. Same-origin Continue form/link, без password/subject із URL |
| `POST /account/erp-login/continue/` | `{authorityId,requestId}`; current site cookie + existing Origin/Host/CSRF policy. Signed LOGIN_INSPECT, then bounded RAM inspection bound to exact site subject/session/witness |
| `POST /account/erp-login/approve/` | `{inspectionId,current:<password>,confirmed:'yes'}`; exact current site session, password reauth, immutable subject, eligibility/pinned owner. Existing REGISTERING→REGISTER, then signed LOGIN_APPROVE. No browser subject/role accepted |
| Successful approval | 303 to signed, exact ERP return URL. Lost ACK = pending/status/retry same operation digest with fresh transport nonce; no new subject/new grant or password replay from disk |

Password-only VPS adapter. OIDC-only account/Sites hosting adapter лишаються deny
до окремого fresh-proof implementation. Не приймати OIDC `iat` як `auth_time`.

## E. ERP↔VPS signed actions — той самий F2 transport

Strict envelope/MAC/path/nonce/generation/32KiB/time/replay rules F2 незмінні.
ERP destination: `POST /api/v1/federation/authority`. Source destination:
`POST /api/federation/introspect`. F3 action gate окремий і default-off.

`SourceRef = {subject,sessionRef,epoch,securityFingerprint,sourcePolicyVersion}`.
Усі поля визначає source coordinator, не HTML form. Для кожної operation retries
мають той самий operationId/body digest і новий transport nonce.
`LoginPolicyRef = {loginPolicyVersion,loginPolicyFingerprint,sourceLoginPolicyFingerprint}`:
перший fingerprint визначає ERP registry, другий — exact локальну VPS login policy.
Source approval та ERP child зберігають обидва; current config зміну відхиляють,
не переприв'язують автоматично. Version має бути узгоджена, fingerprint — 64 hex.

| Action | Strict payload | `receipt.result` |
|---|---|---|
| `LOGIN_INSPECT` SITE→ERP | `{requestId}` | `{requestId,requestBinding,version,expiresAt,companyLabel,client:{clientId,kind,platform,label},returnUrl,loginPolicyVersion,loginPolicyFingerprint}`. Без target user/email lookup; лише BROWSER_BOUND pending request |
| `LOGIN_APPROVE` SITE→ERP | `{requestId,requestBinding,expectedVersion,...SourceRef,reauthAt,sessionExpiresAt,siteLabel,...LoginPolicyRef}` | `{requestId,state:'SOURCE_APPROVED',version,expiresAt,returnUrl}`. Active existing F1 principal→ERP user; current source ledger; immutable target, no merge/grants |
| `LOGIN_STATUS` SITE→ERP | `{requestId,requestBinding,...SourceRef}` | `{requestId,state,version,expiresAt}` тільки для цього approved/pending source; no code/session secret. Fresh read, не historical receipt як authorization |

ERP-approved request states: CREATED → BROWSER_BOUND → SOURCE_APPROVED →
WEB COMPLETE або NATIVE CODE_ISSUED → COMPLETE. CANCELLED/EXPIRED/DENIED terminal.
APPROVE, confirm, code consume — CAS під existing company lock. Source records
CLAIMING/APPROVED є recovery metadata, не ERP authority. One-use і raw code hash
вимикають duplicate sessions/audit effects при concurrent redemption.

Existing `INTROSPECT` action отримує discriminated purposes:

| Purpose | Strict payload | Source requirement |
|---|---|---|
| `LINK_CONFIRM` | Чинний F2 payload **без змін** | Чинні F2 claim/freshness правила |
| `SESSION_ISSUE` | `{purpose:'SESSION_ISSUE',requestId,requestBinding,...SourceRef,...LoginPolicyRef}` | Exact source login approval; issue deadline≤300s; original exact session; fresh password reauth≤300s; current source fingerprint/epoch/generation/eligible/deny gates; обидва policy fingerprints exact |
| `SESSION_USE` | `{purpose:'SESSION_USE',requestId,requestBinding,erpSessionId,...SourceRef,...LoginPolicyRef}` | Same original source session/approval і current gates; source session не прострочена; обидва policy fingerprints exact. Не вимагати password кожні5хв; первісний reauthAt збережений, не поновлюється автоматично |

Signed active result для нових purposes:

```text
{active:true,purpose,requestId,requestBinding,erpSessionId? /* only USE */,
 subject,sessionRef,epoch,securityFingerprint,sourcePolicyVersion,
 loginPolicyVersion,loginPolicyFingerprint,sourceLoginPolicyFingerprint,
 generation,checkedAt,validUntil,sessionExpiresAt,reauthAt}
```

Inactive result — лише `{active:false}`. Verifier звіряє **всі** echoed fields,
purpose, ERP session ID для USE, exact F2 response MAC/request nonce/status/body.
У request-local witness також прив'язуються original KF3 token hash/Actor handle
та phase nonce. Witness не передається client і не переноситься в наступний request.
Source login approval має окремі `issueExpiresAt` і `useExpiresAt`≤source session
expiry: закінчення5min issue window не робить existing ERP session cached allow.

## F. Мінімальна authority/session модель

`auth_sessions` зберігає KF3 hash, тому чинні ERP password/MFA/all-session revoke
шляхи охоплюють його. Окрема обов’язкова immutable child row:

```text
{id:erpSessionId,companyId,userId,tokenHash,requestId,requestBinding,
 bindingId,bindingVersion,authorityId,sourceIssuer,sourceSubject,sourceSessionRef,
 sourceEpoch,sourceGeneration,sourceSecurityFingerprint,sourcePolicyVersion,
 bindingTrustFingerprint,authorityConfigFingerprint,loginPolicyFingerprint,
 sourceLoginPolicyFingerprint,
 clientId,clientKind,platform,redirectUriHash,sourceReauthAt,erpMfaAt?,
 issuedAt,expiresAt,state:'ACTIVE'|'REVOKED',version}
```

Site proof не встановлює ERP `mfa_verified`. Якщо current ERP credential має TOTP,
потрібна його реальна перевірка/one-use counter. Production privileged roles без
configured MFA deny; `mfaRequired` без налаштованого factor теж deny. MFA proof time
фіксується в `erpMfaAt`, не штучно оновлюється token redemption. Credential/role
fingerprint перевіряється повторно під company lock. F1 resolver потребує scoped
`resolveIn(tx,...)` — без nested transaction і без послаблення чинного resolve.

Під час кожного KF3 request: local row/binding precheck → signed online SESSION_USE
**поза SQL lock** → current auth session + child + F1 + ledger/config/policy + witness
deadline під company lock → effect/read → повтор перед commit. Після async I/O та
перед private JSON/file/stream egress — fresh online witness і current PG check.
Source P→L→C linearization — existing PG FENCE. Effect, committed before L,
не скасовується; after-L request/commit/egress deny. No cached authority fallback.
Expired witness до commit rollback; після commit suppress private response й
залишити truthful unknown outcome для idempotent command reconciliation.

SSE: чинний3s poll/60s stream cap з fresh source check на кожному poll; timeout/deny
закриває stream, **≤60s** required gate. Це не виміряний latency/performance claim.

ERP logout/cancel — reduction-only local PG + CSRF, не залежить від source RPC.
Completion ACK лише після commit; DB failure не називати completed revoke.
Site logout/password/profile P→L→C, F1 unlink, disabled trust/user або generation
change закривають наступне KF3 використання. Self-unlink при unavailable source
залишається доступний через чинний незалежний ERP password/MFA login/F2 path.

## G. Mint escape guard і межа F4

Початковий F3 не створює device/enrollment, не переносить активну shift device і
не надає GPS/time telemetry credential. Source-derived request без незалежного
local ERP proof не може видати самому початковому actor новий unfenced device
capability: explicit guard на `device.enroll` і `device.bind`.
Response **403 `LOCAL_ERP_REAUTH_REQUIRED`**, окремий пояснений UI action до чинного
ERP password/MFA входу. Не автоматичний logout і не зміна ERP ролей. `user.invite`
для іншого користувача, role grants і committed operational jobs не є автоматично
похідною сесією ініціатора: їхні current permission/MFA/approval правила лишаються.
`user.password.rotate` та `user.mfa.configure` вже потребують exact current ERP
password; походження F3 саме по собі не додає їм blanket deny. Новий guard для
іншого route допустимий лише після конкретного доведеного self-derived escape.
Exact mint-path inventory буде доданий до implementation plan; невизначений route
не вважати покритим самою цією таблицею.

Справжній незалежний ERP password+required MFA login може створити ordinary session;
це новий proof, не перетворення старої site session. Non-federated login/enrollment
лишаться доступними. Звичайні committed business effects, outbox notifications,
worklogs/financial facts після logout не скасовуються. Worker лишається server actor
з чинними domain/recipient/consent guards; не отримує serialized browser claims.
Жодна відкладена auth/session continuation не може втратити F3 parent lineage.

## H. Replay/outage і ownership

- Start retry same key/input повертає лише той самий nonsecret request handle.
- Source APPROVE lost ACK — historical receipt + separate current status, не нова identity.
- Native confirm response втрачено після CODE_ISSUED: status не відтворює raw code
  або authorizationResponseUrl; explicit cancel/restart. Не видавати другий code
  через blind confirm replay і не показувати вигаданий successful redirect.
- Token exchange має одну redemption; raw KF3/code не зберігаються в command/audit
  receipts. Client після uncertain exchange перевіряє own cookie `/me`, якщо cookie
  отримано; інакше explicit restart. Не видавати новий token на blind replay code.
- Incorrect verifier не споживає code. Concurrent correct attempts — одна session.
- Source/config outage deny new issue/use; local logout/cancel і independent ERP login
  лишаються. Native future production config disabled до actual redirect ownership.

Proposed ownership після review: ERP agent — shared F3 DTOs/protocol additions,
ERP config/login/session child/schema/request-authority/guards + focused tests;
root — VPS coordinator/routes/schema, ERP web UI, actual pair/browser/CI wiring.
Native files не змінюються під час чинного media slice; native adapter окремий scope.

## I. Shared exports для паралельної VPS реалізації

Owner ERP: `erp/packages/integrations/site-federation-login-protocol.mjs` та
`.d.mts`. Node built-ins + existing canonical F2 helper, без Zod або сторонніх
runtime dependencies; VPS включає helper у свій existing esbuild bundle. Це
server/shared module, не client bundle з Node crypto. Existing F2 MAC/envelope
залишається єдиним transport, додаються лише три явно дозволені action names.

| Export | Exact contract |
|---|---|
| `FEDERATION_LOGIN_PENDING_MS`, `FEDERATION_LOGIN_CODE_MS`, `FEDERATION_LOGIN_PROOF_MS` | 300000, 60000, 10000 |
| `FEDERATION_LOGIN_ACTIONS` | readonly `['LOGIN_INSPECT','LOGIN_APPROVE','LOGIN_STATUS']` |
| `normalizeFederationLoginPolicy(value, {erpOrigin,authorityIds,appMode})` | Strict enabled ERP policy above або `null` для absent/`{enabled:false}`; checks exact authority subset, client types, redirects, labels; TEST-only private-use redirect exception explicit |
| `normalizeSourceLoginPolicy(value, {authorityIds})` | Strict `{enabled:true,authorityIds,policyVersion}` або `null` для absent/`{enabled:false}`; known authority subset; sorted/deduplicated canonical IDs |
| `federationLoginPolicyFingerprint(policy)` | 64-hex SHA256 з domain `KNABA-ERP-FEDERATION-LOGIN-POLICY-v1` + canonical normalized enabled ERP policy |
| `sourceLoginPolicyFingerprint(policy)` | 64-hex SHA256 з distinct domain `KNABA-SOURCE-FEDERATION-LOGIN-POLICY-v1` + canonical normalized enabled source policy |
| `parseFederationLoginAction(action,payload)` | Strict payload validator для трьох LOGIN actions у §E; повертає immutable validated DTO; невідомі keys/actions deny |
| `parseFederationLoginActionResult(action,value)` | Strict `receipt.result` validator для трьох LOGIN actions; envelope/current/receipt F2 root перевіряє окремо |
| `parseFederationLoginIntrospection(payload)` | Strict SESSION_ISSUE/SESSION_USE validator; LINK_CONFIRM лишається current F2 path |
| `parseFederationLoginIntrospectionResult(value)` | Strict `{active:false}` або active DTO §E; semantic exact echo/clock checks виконує ERP verifier |
| `parseFederationLoginStart(value,policy)` | Strict WEB/NATIVE start input §C, resolves configured client; caller kind/platform overrides deny |
| `parseFederationLoginToken(value)` | Strict first-party JSON token input §C; S256 verifier syntax, native code format, exact fields |
| `pkceS256(verifier)` | Validate RFC7636 verifier then base64url SHA256 ASCII bytes; no plain fallback |
| `federationLoginRequestBinding(tuple)` | Canonical hash for exact `{companyId,authorityId,requestId,clientId,kind,platform,redirectUri,codeChallenge,stateHash,expiresAt,loginPolicyFingerprint}`; WEB native-only values explicitly null |

Shared errors are stable `FederationProtocolError` codes, without input echo or
credentials. Source freshness/ledger/F1/session permission checks remain runtime
responsibility; a successful DTO parse never authorizes anything.

## J. Required gate до acceptance

Exact-source CPU schemas/PKCE/MFA/old-binary regex + actual PG concurrent issue,
binding/ledger/credential races; actual VPS SQLite↔ERP HTTP/PG pair; real rendered
WEB Strict/Lax cross-site flow та native redirect fixtures. Negative cases:
foreign company/source/client/redirect/issuer/state/verifier, pending source deny,
late code, stale generation/config, missing child row, ancestor/logout/unlink race,
mint escape through device enrollment, replay without duplicate grant, no secrets
in durable receipts/logs, source outage, stream closure≤60s. Physical app-link/signing/
device/provider proof лишаються окремими release gates, не mock/build acceptance.

Primary references: [RFC7636](https://www.rfc-editor.org/rfc/rfc7636),
[RFC8252](https://www.rfc-editor.org/rfc/rfc8252),
[RFC9700](https://www.rfc-editor.org/rfc/rfc9700),
[RFC9207](https://www.rfc-editor.org/rfc/rfc9207).
