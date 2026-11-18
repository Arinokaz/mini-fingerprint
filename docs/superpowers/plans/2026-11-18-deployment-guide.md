# Deployment Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать подробное русскоязычное руководство по сборке Rust/WASM, упаковке локального npm-пакета и его подключению к любому Angular-проекту, включая работу без установленного Rust.

**Architecture:** Основной инструкцией будет отдельный `docs/deployment.md`, построенный вокруг трёх сценариев поставки. Существующие `README.md` и `docs/frontend-guide.md` только ссылаются на него; код и сборочные скрипты не меняются.

**Tech Stack:** Markdown, npm workspaces/npm pack, Angular, TypeScript, Rust, wasm-pack, WebAssembly.

**Spec:** `docs/superpowers/specs/2026-11-18-deployment-guide-design.md`

## Global Constraints

- Документировать только команды и API, реально присутствующие в репозитории.
- Не изменять исходный код, manifests, build scripts или generated-артефакты.
- Node.js `^22.12.0 || >=24.0.0` требуется для сборки репозитория; Rust и wasm-pack не требуются потребителю готового `.tgz`.
- Не рекомендовать копировать `pixel.wasm` в Angular `assets` и не описывать raw `.wasm` как содержимое npm-архива.
- Все команды сборки пакета давать из корня репозитория, а команды установки — из корня Angular-приложения с явными placeholder-путями.

## Review Focus

- **Перенос только `pixel.wasm`:** инструкция должна требовать полный `pkg/` и `src/generated-pixel.ts`; проверяется в Task 1, Step 2.
- **Ожидание `.wasm` внутри `.tgz`:** инструкция должна объяснить base64 embedding и исключение raw WASM; проверяется в Task 1, Step 2.
- **Установка непостроенного локального каталога:** инструкция должна требовать предварительно создать `dist/` и `pkg/`; проверяется в Task 1, Step 2.
- **Интеграция с Angular:** пример должен содержать `span.telemetrics_click[data-tag]`, `TelemetrySdk.getConversionHeaders()` и объединение заголовков с `Content-Type`; проверяется в Task 1, Step 2.
- **Разные зависимости сценариев:** таблица должна отделять полную сборку, готовые WASM-артефакты и готовый npm-архив; проверяется в Task 1, Step 2.

---

### Task 1: Руководство по доставке и Angular-интеграции

**Files:**
- Create: `docs/deployment.md`
- Modify: `README.md`
- Modify: `docs/frontend-guide.md`
- Reference: `scripts/build-wasm.mjs`
- Reference: `packages/marketing-telemetry/package.json`
- Reference: `packages/marketing-telemetry/src/conversion.ts`
- Reference: `apps/demo-web/src/app/conversion-demo.service.ts`

**Interfaces:**
- Consumes: существующие команды `npm run build:wasm`, `npm run build --workspace @company/marketing-telemetry`, `npm pack --workspace @company/marketing-telemetry`; API `new TelemetrySdk()` и `getConversionHeaders(actionPath, properties)`.
- Produces: самостоятельная документация по трём сценариям поставки и ссылки на неё из точек входа проекта.

- [ ] **Step 1: Создать `docs/deployment.md`**

Добавить последовательно: выбор сценария и таблицу зависимостей; установку Rust target/wasm-pack; полную сборку; состав и перенос предсобранных `pkg/` + `generated-pixel.ts`; сборку и проверку `.tgz`; установку архива и локального каталога; Angular DOM/TypeScript/HttpClient-пример; CI/CD-порядок и troubleshooting. Использовать `/path/to/mini-fingerprint` и `/path/to/angular-app` как placeholder-пути и явно разделить команды по рабочим каталогам.

- [ ] **Step 2: Проверить покрытие обязательных случаев**

Run:

```bash
grep -nE 'wasm32-unknown-unknown|wasm-pack|generated-pixel\.ts|npm pack|npm install.*\.tgz|telemetrics_click|getConversionHeaders|HttpClient|base64|CI/CD' docs/deployment.md
```

Expected: каждый шаблон найден; рядом с командами указаны каталог выполнения и необходимые зависимости. Вручную сверить имена generated-файлов, exports и заголовки с файлами из блока Reference.

- [ ] **Step 3: Добавить ссылки из существующей документации**

В `README.md` добавить ссылку в раздел структуры/сборки, а в начало `docs/frontend-guide.md` — указание, что перенос пакета в другой Angular-проект и деплой описаны в `deployment.md`. Не дублировать полное руководство.

- [ ] **Step 4: Проверить итоговый diff**

Run:

```bash
git diff --check
git diff -- README.md docs/frontend-guide.md
git status --short
```

Expected: `git diff --check` завершается без вывода; diff содержит только ссылки, а `git status` показывает новый `docs/deployment.md` и файлы плана/дизайна. Программный код не изменён.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/frontend-guide.md docs/deployment.md docs/superpowers/specs/2026-11-18-deployment-guide-design.md docs/superpowers/plans/2026-11-18-deployment-guide.md
git commit -m "docs: add local package deployment guide"
```
