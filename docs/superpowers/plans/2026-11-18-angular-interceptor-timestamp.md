# Angular Interceptor and Exact Timestamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Добавить Angular interceptor в существующий npm-пакет и заменить временные окна `cv1` на точный Unix timestamp в секундах.

**Architecture:** Root `InjectionToken` создаёт один `TelemetrySdk`; functional `HttpInterceptorFn` вычисляет свежие заголовки для каждого `HttpClient`-запроса и делает fail-open только на этапе генерации. Demo использует `HttpClient`. Существующие обратимые `pulse` и stage pipeline сохраняются, но получают timestamp вместо выбранного окна.

**Tech Stack:** Angular 21, TypeScript, RxJS, Rust, WebAssembly, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-18-angular-interceptor-timestamp-design.md`

## Global Constraints

- Один пакет `@company/marketing-telemetry`; без второго Angular adapter.
- Нет endpoint allowlist, nonce, retry, JavaScript fallback и PHP implementation.
- Все timestamp — Unix seconds `u64`; рекомендуемая будущая серверная политика: past 30 seconds, future 5 seconds.
- Не коммитить изменения: пользователь выбрал работу в текущем каталоге на `main`.
- Не запускать финальные browser/release regression-проверки в этой итерации.

## Review Focus

- URL с query/fragment и absolute URL: в WASM попадает только pathname; тесты Task 2.
- Ошибка генерации против HTTP 403: первая отправляет исходный request, вторая не вызывает повтор; тесты Task 2.
- Concurrent requests: один runtime, но независимые вычисления; существующие runtime/conversion tests и Task 2.
- Timestamp-секунда против миллисекунд: golden fixtures и Rust tests Task 1.
- Missing/duplicate DOM marker: сохраняется deterministic fallback; существующие Rust/browser contracts, быстрые Rust tests Task 1.

---

### Task 1: Точный timestamp в Rust и контракте

**Files:**
- Modify: `crates/funnel-wasm/src/lib.rs`, `pulse.rs`, `journey.rs`, `stages.rs`
- Modify: `crates/funnel-wasm/tests/pulse_tests.rs`, `stage_tests.rs`
- Modify: `contracts/conversion-v1.md`, `tests/fixtures/conversion-v1.json`, `scripts/check-contract.mjs`
- Modify: `docs/php-mirror-pseudocode.md`, связанная документация

**Interfaces:**
- Produces: `JourneyContext::new(journey, touchpoint, properties, timestamp)` и fixture fields `selectedTimestamp`, `decodedTimestamp`.
- Preserves: `encode_pulse(u64)`, `decode_pulse((u32,u32))`, headers и stage arithmetic.

- [x] Обновить Rust tests: удалить boundary assertions, проверять `selectedTimestamp == now`, round-trip называть timestamps.
- [x] Запустить целевые Rust tests и убедиться, что старая window-реализация не соответствует новым ожиданиям.
- [x] В `calculate_funnel_score` передавать `now_seconds` напрямую; удалить `select_window` и интервальные константы, переименовать внутренние `window` в `timestamp`.
- [x] Мигрировать fixture inputs: `now = selectedTimestamp = decodedTimestamp` для каждого случая, сохранив независимо вычисленные pulse/stage/score vectors; удалить interval/boundary metadata.
- [x] Обновить contract checker и нормативный текст: PHP проверяет возраст timestamp, а не previous/current/next window.
- [x] Запустить `cargo test --manifest-path crates/funnel-wasm/Cargo.toml` и `npm run check:contract`.

### Task 2: Angular-only пакет и interceptor

**Files:**
- Create: `packages/marketing-telemetry/src/angular-interceptor.ts`
- Create: `packages/marketing-telemetry/tests/angular-interceptor.test.ts`
- Modify: `src/index.ts`, `package.json`, `scripts/build.mjs`, `scripts/release.mjs`

**Interfaces:**
- Produces: `marketingTelemetryInterceptor: HttpInterceptorFn`.
- Consumes: `TelemetrySdk.getConversionHeaders(actionPath, properties = {})`.
- Internal: root `InjectionToken<TelemetrySdk>` с factory `new TelemetrySdk()`.

- [x] Написать failing tests: все методы без endpoint filter, pathname из relative/absolute URL, игнорирование `urlWithParams`, пустые properties, пять headers, generation failure → original request, downstream error → один вызов без повтора.
- [x] Запустить interceptor tests и подтвердить отсутствие реализации.
- [x] Реализовать interceptor с `from(...).pipe(map(clone), catchError(of(req)), switchMap(next))`; `catchError` должен стоять до downstream `switchMap`.
- [x] Добавить peer dependencies `@angular/common`, `@angular/core`, `rxjs`; исключить Angular/RxJS из esbuild bundle и сохранить peers в release manifest.
- [x] Экспортировать interceptor из публичного index и запустить package unit tests.

### Task 3: Demo на HttpClient

**Files:**
- Modify: `apps/demo-web/src/main.ts`, `src/app/app.ts`, `src/app/conversion-demo.service.ts`
- Modify: `apps/demo-web/tests/conversion-demo.service.test.ts`

**Interfaces:**
- Consumes: зарегистрированный `marketingTelemetryInterceptor` из Task 2.
- Preserves: `ConversionDemoService.submit(journey, email, password): Promise<SubmissionResult>`.

- [x] Переписать unit tests на mock `HttpClient.post`: request больше не получает headers/form properties вручную; HTTP status маппится в generic result; network error остаётся observable.
- [x] Запустить demo tests и подтвердить FAIL на старом fetch API.
- [x] Зарегистрировать `provideHttpClient(withInterceptors([marketingTelemetryInterceptor]))`; внедрить `HttpClient` в demo service и убрать ручной `TelemetrySdk`/properties.
- [x] Запустить demo unit tests и production TypeScript/Angular build.

### Task 4: Документация и быстрый регресс

**Files:**
- Modify: `docs/architecture.md`, `docs/modules/telemetry-package.md`, `docs/modules/angular-demo.md`, `docs/modules/rust-wasm.md`, `docs/deployment.md`, связанные guides
- Reference: `docs/superpowers/specs/2026-11-18-secondary-typescript-telemetry-design.md`

- [x] Обновить поток выполнения, peerDependencies, interceptor setup, timestamp semantics и fail-open поведение.
- [x] Запустить быстрый регресс: `npm run check:contract`, Cargo tests, package/demo unit tests, package build и Angular production build.
- [x] Исправить обнаруженные быстрым регрессом ошибки.
- [x] Зафиксировать фактически выполненные команды и непроверенные риски в итоговом отчёте.

## Обязательный финальный регресс после этой итерации

- [x] `npm test` — полный набор workspace/contract tests.
- [x] `cargo test --manifest-path crates/funnel-wasm/Cargo.toml` — Rust unit/golden tests.
- [x] `npm run build` — WASM, npm package и Angular production build с нуля.
- [ ] У frontend-команды подтвердить версии Angular/RxJS, способ формирования API URL и порядок существующих interceptor’ов; telemetry должен регистрироваться последним после URL rewrites.
- [ ] `npm run build:npm` и `npm run test:release --workspace @company/marketing-telemetry` — оба архива.
- [ ] `npm run test:package:angular` — установка архивов, production builds и browser checks.
- [ ] `npm run test:browser` — реальный WASM, DOM variants, golden headers и network behavior.
- [ ] При любом сбое исправить реализацию и повторить полный регресс; не считать работу окончательно проверенной до зелёного результата.
