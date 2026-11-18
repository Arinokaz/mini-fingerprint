# Russian Source Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить полные русскоязычные комментарии в handwritten TypeScript/Angular/Rust-исходники без изменения поведения и без попадания комментариев в production.

**Architecture:** Работа разделена по существующим subsystem boundaries. Внешние docs остаются подробными, а source comments объясняют назначение, вход/результат, side effects, ошибки и инварианты рядом с кодом. Existing build pipeline удаляет comments из release.

**Tech Stack:** TypeScript, Angular, Rust, Markdown, esbuild.

**Spec:** `docs/superpowers/specs/2026-11-18-russian-source-comments-design.md`

## Global Constraints

- Меняются только comments/Doc comments, не исполняемая логика, имена, signatures или config.
- Комментарии на русском; технические идентификаторы остаются в исходном виде.
- Generated files не редактируются вручную.
- Не выполнять commit/push.
- Release JS не должен содержать comments; Rust comments не компилируются в WASM.

## Review Focus

- **Комментарий противоречит коду:** каждый subsystem сверяется с source/tests, затем проходит независимое review.
- **Комментарий попадает в npm/browser:** release tests проверяют stripped artifacts после rebuild.
- **Generated файл изменён вручную:** diff и build regeneration проверяют handwritten-only scope.
- **Чрезмерный очевидный комментарий мешает чтению:** review оценивает назначение/логику, а не построчный пересказ.
- **Русский Doc comment ломает компиляцию:** TypeScript и Cargo test suites запускаются после edits.

---

### Task 1: TypeScript package и build tooling

**Files:** handwritten `packages/marketing-telemetry/src/*.ts` кроме generated; `packages/marketing-telemetry/scripts/*.mjs`; `scripts/build-wasm.mjs`.

- [ ] **Step 1:** Перевести/дополнить module, class, public API, helper, runtime, error/fallback и build/release comments.
- [ ] **Step 2:** Run `npm run build --workspace @company/marketing-telemetry && npm test --workspace @company/marketing-telemetry`.
- [ ] **Step 3:** Проверить отсутствие English source comments и generated diffs.

### Task 2: Angular demo

**Files:** handwritten `apps/demo-web/src/main.ts`, `src/app/*.ts`; templates не менять.

- [ ] **Step 1:** Перевести/дополнить component/service/bootstrap comments, включая состояние, submit, side effects и errors.
- [ ] **Step 2:** Run `npm run build --workspace demo-web -- --configuration=production` и Angular unit tests.

### Task 3: Rust crate

**Files:** `crates/funnel-wasm/src/*.rs`.

- [ ] **Step 1:** Перевести/дополнить module docs, browser export, structs/traits, методы, validation, DOM/time, stages, absorb/diffuse и projection comments.
- [ ] **Step 2:** Run `cargo test --manifest-path crates/funnel-wasm/Cargo.toml` с project-local toolchain.

### Task 4: Release stripping и итоговое review

- [ ] **Step 1:** Run `npm run build:npm`, `npm test`, release tests и `git diff --check`.
- [ ] **Step 2:** Проверить отсутствие comments в обоих `.tgz`, отсутствие generated/source behavior diffs и локальный uncommitted status.
- [ ] **Step 3:** Провести read-only review; исправить Critical/Important findings без commit/push.
