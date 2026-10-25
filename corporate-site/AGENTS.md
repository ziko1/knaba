# KNABA corporate-site — scoped agent QA policy

This file complements the existing project memory, roadmap, PR instructions and all higher-priority security/release gates. It does not authorize production work.

- For KNABA source/branding browser QA, prefer a **local HTTP loopback preview**, not `file://`, and run `npm run test:logo:browser` with an explicit `KNABA_TEST_URL`. This checks DE/EN/UK/RU at 320/390/768/1440 px.
- On `net::ERR_BLOCKED_BY_ADMINISTRATOR`, classify the failure as an **environment policy block**, not a site bug and not PASS. Do **not** disable or bypass browser administrator policies or keep retrying Chromium in the same environment.
- Use the browser gate: Chromium at most once per invocation, then WebKit, then Firefox **only when already available and authorized**. If Chromium was already policy-blocked in the current task/environment, set `KNABA_BROWSER_SKIP=chromium` for following invocations. Do not install/download browsers or consume paid credits without approved budget and permission.
- Browser gate exit statuses: 0=PASS for completed logo browser checks; 1=FAIL for site/test defects or invalid setup; 2=BLOCKED for no available usable browser. A BLOCKED result must never be presented as passing browser/device/zoom acceptance.
- If all browser engines are blocked/unavailable, continue independent source checks and Node/Astro/build tests where possible. Record exact SHA, test counts, failed/blocked reasons and next QA location. Do not repeat unchanged blockage prose or claim visual/mobile/device readiness.
- Opera Connector is a possible separate browser route only after a fresh `list_tabs` success and user-authorized access. An authenticated website session is not proof of native connector access. Work browser and VPS Opera Lab are separate environments.
- Never merge, deploy to production, edit owner data, change browser policy, disable security gates or activate paid services under this QA fallback rule. Preserve PR Draft until independent review and user release authorization.
