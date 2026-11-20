# Three-Header Analytics Envelopes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить 11 package-owned headers на шесть: project ID, pulse и canonical base64url event envelope для каждого независимого пакета.

**Architecture:** Facades сохраняют существующие cv2/pa1 вычисления и упаковывают результаты в три transport headers. Project ID поступает из Angular/environment settings. Interceptors атомарно устанавливают или удаляют ровно три собственных headers; backend pseudocode извлекает прежние algorithm inputs из envelope.

**Tech Stack:** Angular, TypeScript, RxJS, Rust/WASM, Node test runner, esbuild.

**Spec:** `docs/superpowers/specs/2026-11-20-three-header-envelopes-design.md`

## Global Constraints

- Ровно три headers на пакет; никакого общего envelope для двух контуров.
- Сохранить cv2/pa1 algorithms, fixtures, timestamp, click/event IDs, properties, snapshot и DOM semantics.
- Envelope JSON: cv2 keys `client,eid,props,sum,v`; pa1 keys `data,eid,sum,v`; base64url без padding, лишние поля запрещены.
- Project ID публичный, project-specific и валидируется как `/^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/`; отсутствие/ошибка означает generation failure и fail-open.
- Не менять PHP implementation status, nonce/replay policy, Worker/CSP и sampling.
- После изменений выполнить полный build/unit/Rust/release/packed/browser regression и исправить сбои.

## Review Focus

- Missing/invalid project ID: request должен пройти без headers соответствующего пакета; Task 1/2 tests.
- Pre-existing old six/five headers и headers другого пакета: удалить все owned old/new names, сохранить чужие; Task 1/2 tests.
- Canonical envelope и malformed runtime values: нет partial transport; Task 1/2 exact-value tests.
- Оба interceptor orders и generation/downstream failures: один downstream request, независимые наборы; Task 3 integration tests.
- Full/product-only browser modes: ровно 6/3 owned names, нет старых headers; Task 4 assertions.

---

### Task 1: Marketing cv2 three-header transport

**Files:**
- Modify: `packages/marketing-telemetry/src/settings.ts`, `types.ts`, `conversion.ts`, `angular-interceptor.ts`
- Modify: `packages/marketing-telemetry/tests/conversion.test.ts`, `angular-interceptor.test.ts`, `pixel.integration.test.ts`, `release.test.ts`

**Interfaces:**
- Consumes: существующий `TelemetrySdk` runtime payload `{profile,clickId,pulse,score,properties}`.
- Produces: `TelemetrySettings.measurementId?: string`; `getConversionHeaders()` возвращает ровно `X-GA-Measurement-Id`, `X-GA-Session-Id`, `X-GA-Session-Properties`.
- Envelope: `{client: COUNTER_CLIENT, eid: clickId, props: properties, sum: score, v: 'cv2'}` в указанном порядке.

- [x] Написать failing facade tests: configured project ID возвращается первым header; decoded envelope точно содержит cv2 fields; отсутствуют `X-Amplitude-Device-Id`, `X-Amplitude-Event-Id`, `X-YM-Counter-Client`; missing/invalid ID отклоняет generation.
- [x] Написать failing interceptor tests: exact three-name set, fail-open удаляет все старые/новые owned names и сохраняет pa1/unrelated headers.
- [x] Запустить целевые tests и подтвердить FAIL на старом шестизаголовочном transport.
- [x] Реализовать validation, canonical JSON/base64url envelope и сокращённый owned-header list; не менять runtime/WASM.
- [x] Обновить real-Wasm и release assertions на fixture `pulse/clickId/score/properties` внутри нового transport.
- [x] Запустить `npx tsx --test packages/marketing-telemetry/tests/{conversion,angular-interceptor,pixel.integration}.test.ts` и package build.

### Task 2: Product pa1 three-header transport and providers

**Files:**
- Modify: `packages/product-analytics/src/settings.ts`, `types.ts`, `product-analytics.ts`, `providers.ts`, `angular-interceptor.ts`, `index.ts` при необходимости exports
- Modify: `packages/product-analytics/tests/product-analytics.test.ts`, `providers.test.ts`, `angular-interceptor.test.ts`, `release.test.ts`

**Interfaces:**
- Consumes: существующий `calculatePageResult()` и `serializeSnapshot()`.
- Produces: `ProductAnalyticsSettings.measurementId?: string`; `ProductAnalytics(settings?)`; `provideProductAnalytics(settings?)`; ровно `X-PA-Measurement-Id`, `X-PA-Session-Id`, `X-PA-Session-Properties`.
- Envelope: `{data: serializeSnapshot(...), eid: eventId, sum: score, v: 'pa1'}` в указанном порядке.

- [x] Написать failing facade/provider tests: configured ID, exact decoded envelope, old `X-PA-Device-Id`/`X-PA-Event-Id` отсутствуют, missing/invalid ID отклоняет generation, provider передаёт settings в root facade.
- [x] Написать failing interceptor tests: exact three-name set и fail-open для всех старых/новых pa1 names без удаления cv2/unrelated headers.
- [x] Запустить целевые tests и подтвердить FAIL на старом пятизаголовочном transport.
- [x] Реализовать settings token/provider, validation и canonical envelope; не менять snapshot/engagement/page pipeline.
- [x] Обновить built pa1 release test на fixture values внутри envelope и сохранить size assertions для полного transport.
- [x] Запустить product unit tests и package build.

### Task 3: Demo configuration, chained behavior and normative documents

**Files:**
- Modify: `apps/demo-web/src/main.ts`, `src/environments/environment*.ts`, `apps/demo-web/tests/toolchain.test.ts`
- Test: `packages/marketing-telemetry/tests/angular-interceptor.test.ts`, `packages/product-analytics/tests/angular-interceptor.test.ts` или focused chained test
- Modify: `contracts/conversion-v2.md`, `contracts/product-analytics-v1.md`, `docs/php-mirror-pseudocode.md`, `docs/deployment.md`, `docs/architecture.md`, `docs/frontend-guide.md`, `docs/modules/*.md`, `README.md`

**Interfaces:**
- Consumes: Tasks 1/2 settings APIs.
- Demo IDs: production `G-8F3K2M7Q` / `PA-59DK2M8Q`; staging/development получают явно отличающиеся project-specific IDs.

- [x] Добавить failing chained tests для обоих interceptor orders, независимых failures и pre-existing headers; подтвердить, что каждый контур оставляет/удаляет только свои три headers.
- [x] Зарегистрировать demo IDs через `TELEMETRY_SETTINGS` и `provideProductAnalytics(settings)`; обновить environment/toolchain assertions.
- [x] Обновить contract transport sections и PHP pseudocode: project ID → pulse → strict canonical envelope → existing score verification.
- [x] Обновить integration docs: ровно 6/3 headers, envelope fields, public non-secret IDs, fail-open и удалённые header names.
- [x] Запустить demo/unit tests и `npm run check:contract`.

### Task 4: Browser/release assertions and full regression

**Files:**
- Modify: `scripts/check-browser.mjs`, `scripts/check-contract.mjs` при transport fixture checks
- Modify: `tests/fixtures/conversion-v2.json`, `tests/fixtures/product-analytics-v1.json` только при добавлении transport expectations
- Modify: release/package tests обоих пакетов

- [x] Обновить failing browser expectations: decode envelopes, сверить fixture IDs/scores/properties/snapshot, требовать exact owned-name set 6 в full и 3 в product-only, отклонять старые headers.
- [x] Добавить независимые literal transport fixtures или exact encoded expectations для canonical cv2/pa1 envelopes; проверить их contract/source tests.
- [x] Запустить `npm run build`, `npm test` и `cargo test --manifest-path crates/funnel-wasm/Cargo.toml`; исправить сбои.
- [x] Запустить `npm run build:npm`, оба `test:release`, `npm run test:package:angular`, product-only packed check и `npm run test:browser`; исправить и повторить полный regression.
- [x] Выполнить fresh read-only review полного diff; Critical/Important исправить через RED→GREEN и повторить regression.
- [x] Зафиксировать фактические команды, результаты и оставшийся внешний production compatibility gate.
