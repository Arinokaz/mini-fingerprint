# PHP Developer Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать внутреннюю русскоязычную документацию, объясняющую PHP-разработчику архитектуру и реальные классы/методы/функции Angular, TypeScript и Rust/WASM для дальнейших доработок.

**Architecture:** Четыре связанных человекочитаемых документа: входной PHP-гид, архитектура, TypeScript/Angular modules и Rust modules. Документы ссылаются на исходники, контракт и тесты, но не включаются в npm/production artifacts.

**Tech Stack:** Markdown, TypeScript, Angular 21, Rust, WebAssembly.

**Spec:** `docs/superpowers/specs/2026-11-18-php-developer-docs-design.md`

## Global Constraints

- Только документация; исходный код и generated artifacts не менять.
- Ничего не коммитить и не отправлять в Git по явному указанию пользователя.
- Сверять каждое описание с текущим кодом; `contracts/conversion-v1.md` — нормативный источник алгоритма.
- Для важных классов/методов указывать назначение, вызов, вход/результат, логику, side effects, ошибки/fallback, инварианты и тесты, где применимо.
- Не публиковать internal docs через npm `files` или Angular assets.

## Review Focus

- **Документ расходится с кодом после рефакторинга:** каждый Task содержит source-to-doc verification и точные file links.
- **PHP-разработчик не понимает термин:** Task 1 даёт аналогии, а Tasks 2–3 объясняют незнакомые конструкции при первом использовании.
- **Случайное раскрытие internal docs:** Task 4 проверяет npm package file list и Angular assets config.
- **Generated файл принят за исходник:** Tasks 2–3 явно маркируют generated inputs/outputs.
- **Описание маскировки принято за доказательство безопасности:** Task 1 фиксирует trust boundary и необходимость серверной проверки.

---

### Task 1: Входной гид и архитектура

**Files:**
- Create: `docs/php-developer-guide.md`
- Create: `docs/architecture.md`
- Reference: `README.md`, `contracts/conversion-v1.md`, `docs/deployment.md`

**Interfaces:**
- Produces: ссылки/якоря на module guides и единый end-to-end поток для Tasks 2–3.

- [ ] **Step 1:** Написать PHP-гид с аналогиями Composer/npm/Cargo, классами/traits/Result/Option, Angular component/service и инструкцией, как формулировать доработку по карточке метода.
- [ ] **Step 2:** Написать архитектуру: submit → service → TelemetrySdk → RuntimeGate → pixel-runtime → Rust stages → headers → HTTP; embedded/lazy и границы безопасности.
- [ ] **Step 3:** Сверить ссылки и поток с текущим `deployment.md`, package source entry и demo service.

### Task 2: TypeScript-пакет и Angular demo

**Files:**
- Create: `docs/modules/telemetry-package.md`
- Create: `docs/modules/angular-demo.md`
- Reference: `packages/marketing-telemetry/src/*.ts`, `packages/marketing-telemetry/scripts/*.mjs`, `packages/marketing-telemetry/tests/*.test.ts`
- Reference: `apps/demo-web/src/**`, `apps/demo-web/tests/**`

**Interfaces:**
- Consumes: архитектурный поток Task 1.
- Produces: карточки каждого source module, TelemetrySdk/RuntimeGate и Angular App/ConversionDemoService.

- [ ] **Step 1:** Описать TypeScript public API, conversion validation/headers, runtime loading, pixel initialization, types/settings и build/release responsibilities; generated files отметить отдельно.
- [ ] **Step 2:** Описать Angular component/service/template/environments, параметры/результаты, side effects, errors и связанные tests.
- [ ] **Step 3:** Сверить каждое имя, signature, header и fallback с исходниками; не выдумывать backend behavior.

### Task 3: Rust/WASM crate

**Files:**
- Create: `docs/modules/rust-wasm.md`
- Reference: `crates/funnel-wasm/Cargo.toml`, `crates/funnel-wasm/src/*.rs`, `crates/funnel-wasm/tests/**`
- Reference: `contracts/conversion-v1.md`, `tests/fixtures/conversion-v1.json`

**Interfaces:**
- Consumes: end-to-end поток Task 1.
- Produces: карта crate, объяснение exported `calculate_funnel_score`, всех modules и важных structs/functions, stage order, DOM/time/property edge cases и tests.

- [ ] **Step 1:** Описать Rust syntax/сrate setup и browser export для PHP-разработчика.
- [ ] **Step 2:** Описать каждый Rust source module в порядке потока вычисления, включая назначение, логику, ограничения и тестовые гарантии; детали битовых таблиц ссылать на контракт.
- [ ] **Step 3:** Сверить названия, типы, fallback, временные окна и свойства с кодом/fixtures.

### Task 4: Связи и финальная проверка

**Files:**
- Modify: `README.md`
- Modify: `docs/frontend-guide.md`
- Modify: `docs/deployment.md`

**Interfaces:**
- Consumes: все новые документы Tasks 1–3.

- [ ] **Step 1:** Добавить короткие ссылки на внутренний PHP-гид из существующих точек входа.
- [ ] **Step 2:** Запустить проверку ссылок, покрытия source modules и `git diff --check`; убедиться, что `git status` показывает только локальные документационные изменения.
- [ ] **Step 3:** Провести отдельное read-only review точности и полноты; исправить Critical/Important findings. Не выполнять commit/push.
