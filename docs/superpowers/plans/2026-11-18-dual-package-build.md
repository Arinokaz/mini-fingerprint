# Dual Package Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Выпускать минимизированный `@company/marketing-telemetry` в двух локальных `.tgz`-вариантах — однофайловом `embedded` и разделённом `lazy` — без отдельного WASM, исходников, комментариев и source maps.

**Architecture:** Общий `RuntimeGate` динамически загружает один внутренний модуль, объединяющий base64 и wasm-bindgen glue. esbuild встраивает модуль в entry для `embedded` или создаёт один content-hashed chunk для `lazy`; TypeScript создаёт declarations. Release-скрипт собирает независимые staging-пакеты, архивы и size report, а Angular browser suite проверяет каждый архив.

**Tech Stack:** TypeScript 5.9, Node.js 22+/24+, esbuild, npm pack, Angular 21, Rust/wasm-pack, Node test runner, existing Chromium/CDP checks.

**Spec:** `docs/superpowers/specs/2026-11-18-dual-package-build-design.md`

## Global Constraints

- Публичные `new TelemetrySdk()` и `getConversionHeaders(actionPath, properties)` не меняются.
- Не менять Rust-алгоритм, headers, DOM contract или golden fixtures.
- Оба архива имеют package name/version `0.1.0`, но разные filename suffixes `embedded` и `lazy`; оба варианта в один `.tgz` не входят.
- JS собирается как browser ESM, ES2022, bundled/minified, `legalComments=none`, без source maps; base64-WASM инициализируется из bytes без `fetch`.
- В архивах нет `src/`, `pkg/`, Rust, docs, `.wasm` или `.map`; generated `pkg/` остаётся build input.
- Не добавлять runtime dependencies, compression или произвольный size limit.
- Не полагаться на Angular optimization потребителя; пакет минимизируется до `npm pack`.
- Сканировать `.js`/`.d.ts` на `security|protection|secret|token|attack|bot|signature|authentication|authorization` без учёта регистра, исключив длинные base64-литералы из JS; `calculate_funnel_score` сохраняется.

## Review Focus

- **Base64 случайно содержит запрещённое слово:** scanner должен игнорировать payload; Task 3 добавляет positive/negative unit cases для scanner.
- **Lazy facade импортирован, но API не вызван:** ни runtime, ни pixel chunk не должны инициализироваться; Task 3 и Task 4 проверяют это в ESM и Angular.
- **Chunk загрузка завершилась ошибкой:** следующий вызов должен повторить инициализацию; существующий RuntimeGate test закрепляется в Task 1 и используется обоими вариантами.
- **Повторные/concurrent API calls:** должен быть один runtime/chunk request; Task 3 проверяет shared gate, Task 4 — фактические network requests.
- **Size report влияет на выпуск:** отчёт обязан содержать raw/base64/JS/gzip sizes, но не попадать в архивы; Task 3 проверяет структуру и отсутствие лимита.

---

### Task 1: Выделить общий WASM runtime-модуль

**Files:**
- Create: `packages/marketing-telemetry/src/pixel-runtime.ts`
- Modify: `packages/marketing-telemetry/src/runtime.ts`
- Test: `packages/marketing-telemetry/tests/runtime.test.ts`
- Test: `packages/marketing-telemetry/tests/pixel.integration.test.ts`

**Interfaces:**
- Consumes: `PIXEL_BASE64`, generated `../pkg/funnel_wasm.js`, `PixelRuntime`, `RuntimeLoader`.
- Produces: `instantiatePixelRuntime(): Promise<PixelRuntime>` из `pixel-runtime.ts`; существующие `loadPixelRuntime: RuntimeLoader` и `RuntimeGate` из `runtime.ts`.

- [ ] **Step 1: Зафиксировать поведение до рефакторинга**

Run после наличия generated WASM: `npm test --workspace @company/marketing-telemetry`.
Expected: существующие runtime/facade/real-WASM tests проходят; если среда не имеет Rust/wasm-pack, записать ограничение и выполнить после подготовки toolchain, не создавая фиктивный WASM.

- [ ] **Step 2: Вынести конкретную инициализацию в `pixel-runtime.ts`**

Перенести base64 decode и generated glue initialization в `instantiatePixelRuntime(): Promise<PixelRuntime>`. В `loadPixelRuntime` выполнять один `await import('./pixel-runtime.js')` и вернуть результат `instantiatePixelRuntime()`. `RuntimeGate` и его constructor/acquire не менять.

- [ ] **Step 3: Проверить рефакторинг**

Run: `npm test --workspace @company/marketing-telemetry`.
Expected: PASS; lazy loading, concurrent sharing, retry-after-error и golden real-WASM headers сохранены.

- [ ] **Step 4: Commit**

```bash
git add packages/marketing-telemetry/src/runtime.ts packages/marketing-telemetry/src/pixel-runtime.ts
git commit -m "refactor: isolate pixel runtime initialization"
```

### Task 2: Минифицированная embedded-сборка

**Files:**
- Create: `packages/marketing-telemetry/scripts/build.mjs`
- Create: `packages/marketing-telemetry/scripts/artifact-rules.mjs`
- Modify: `packages/marketing-telemetry/package.json`
- Modify: `packages/marketing-telemetry/tsconfig.json`
- Modify: `package-lock.json`
- Test: `packages/marketing-telemetry/tests/package-contents.test.ts`

**Interfaces:**
- Consumes: `src/index.ts`, declarations из TypeScript, runtime seam из Task 1.
- Produces: `build.mjs --variant embedded --out-dir <absolute-or-package-relative-path>`; default `npm run build --workspace @company/marketing-telemetry` создаёт `dist/index.js` и declarations.

- [ ] **Step 1: Переписать package-content test на новый release contract**

Проверять `dist/index.js`/`.d.ts`, отсутствие `pkg/`, source/docs/`.wasm`/`.map`, `/*`, `*/`, `sourceMappingURL` и banned terms после исключения base64. Проверять, что JS содержит длинный base64 payload и export `TelemetrySdk`, но не отдельный `pixel-` chunk.

- [ ] **Step 2: Подтвердить RED**

Run после старой `tsc`-сборки: `npm test --workspace @company/marketing-telemetry -- --test-name-pattern="NPM tarball"`.
Expected: FAIL, потому что старый архив включает `pkg/` и неминифицированный JS.

- [ ] **Step 3: Добавить esbuild и build script**

Добавить прямую devDependency `esbuild`; TypeScript запускать с `--emitDeclarationOnly`, `removeComments=true`. esbuild должен bundle/minify `src/index.ts` в `<out-dir>/index.js` с ESM/ES2022/legalComments none/no sourcemap. Для embedded не включать code splitting. Изменить package `files` на только `dist`, сохранив existing exports.

- [ ] **Step 4: Подтвердить GREEN**

Run: `npm run build --workspace @company/marketing-telemetry && npm test --workspace @company/marketing-telemetry`.
Expected: PASS; demo продолжает разрешать `dist/index.js`, package-content contract выполнен.

- [ ] **Step 5: Commit**

```bash
git add packages/marketing-telemetry package-lock.json
git commit -m "build: add minified embedded package"
```

### Task 3: Lazy chunk, два архива и size report

**Files:**
- Create: `packages/marketing-telemetry/scripts/release.mjs`
- Create: `packages/marketing-telemetry/tests/release.test.ts`
- Modify: `packages/marketing-telemetry/scripts/build.mjs`
- Modify: `packages/marketing-telemetry/package.json`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: build CLI из Task 2.
- Produces: `build.mjs --variant lazy --out-dir <path>`; `npm run build:npm` из root; `release/company-marketing-telemetry-0.1.0-{embedded,lazy}.tgz`; `release/size-report.json`; package-level `test:release`.

- [ ] **Step 1: Написать failing release tests**

Тесты должны запускать release command и проверять оба `.tgz`: embedded содержит только entry runtime; lazy — entry и ровно один `pixel-[hash].js`; base64 только в lazy chunk; lazy entry меньше embedded; нет дублирования payload, banned files/comments/terms. Проверить size report numeric fields `rawWasmBytes`, `base64Bytes`, `variants.embedded.files`, `variants.lazy.files` с `bytes` и `gzipBytes`. Scanner unit cases: слово в коде даёт FAIL, случайное слово внутри длинного base64 не даёт FAIL.

- [ ] **Step 2: Подтвердить RED**

Run: `npm run test:release --workspace @company/marketing-telemetry`.
Expected: FAIL из-за отсутствия release command/архивов, а не из-за синтаксиса теста.

- [ ] **Step 3: Реализовать lazy и release**

Для lazy включить esbuild `splitting`, `chunkNames=pixel-[hash]`, ESM outdir. Release-скрипт создаёт отдельные staging package dirs под gitignored `release/`, копирует manifest с `dist`-only files, вызывает оба build variants, упаковывает через `npm pack`, переименовывает архивы с variant suffix и пишет size report вне staging. Root `build:npm` сначала выполняет `build:wasm`, затем package release. Не удалять существующий default embedded build.

- [ ] **Step 4: Проверить оба пакета и runtime**

Run: `npm run build:npm && npm run test:release --workspace @company/marketing-telemetry && npm test`.
Expected: PASS; размеры выведены, оба built JS smoke tests возвращают одинаковые golden headers без `fetch`, lazy импорт без API call не загружает runtime.

- [ ] **Step 5: Commit**

```bash
git add .gitignore package.json packages/marketing-telemetry
git commit -m "feat: add lazy telemetry package variant"
```

### Task 4: Проверка обоих архивов в Angular и документация

**Files:**
- Create: `scripts/check-package-angular.mjs`
- Modify: `scripts/check-browser.mjs`
- Modify: `package.json`
- Modify: `docs/deployment.md`
- Modify: `README.md`
- Modify: `docs/frontend-guide.md`

**Interfaces:**
- Consumes: два `.tgz` из Task 3.
- Produces: root `test:package:angular`; browser env `DEMO_BROWSER_ROOT` и `TELEMETRY_VARIANT=embedded|lazy`; документированный выбор/установка обоих вариантов без изменения Angular API.

- [ ] **Step 1: Добавить failing variant assertions**

В browser suite зафиксировать: embedded не запрашивает `pixel-*.js`; lazy до первого submit не запрашивает chunk, после него запрашивает ровно один `pixel-*.js`; последующие submits не повторяют request. Оба variants сохраняют все existing golden/DOM/no-WASM assertions.

- [ ] **Step 2: Подтвердить RED**

Run существующий browser suite с `TELEMETRY_VARIANT=lazy` против embedded demo.
Expected: FAIL на отсутствии ожидаемого lazy chunk; embedded mode остаётся совместимым.

- [ ] **Step 3: Реализовать изолированную установку архивов**

`check-package-angular.mjs` для каждого variant создаёт отдельный temporary demo в `/tmp/opencode`, копирует только demo sources/config, заменяет dependency на абсолютный путь к соответствующему `.tgz`, устанавливает dependencies, выполняет Angular production build и вызывает browser suite с output root/variant env. Сохранить существующее WSL/Chrome делегирование и очищать temp dirs в `finally`.

- [ ] **Step 4: Обновить руководство**

Описать `npm run build:npm`, оба имени архивов, одинаковый install/API, Network- и size-различия, `size-report.json`, `test:release` и `test:package:angular`. Убрать устаревшее требование включать `pkg/funnel_wasm.js` в готовый архив: `pkg/` остаётся обязательным только для build/prebuilt input.

- [ ] **Step 5: Выполнить полную проверку**

Run: `npm test && npm run test:release --workspace @company/marketing-telemetry && npm run test:package:angular && git diff --check`.
Expected: PASS для обоих packed variants; browser не показывает `.wasm`, lazy chunk загружается один раз, diff не содержит whitespace errors. Любое отсутствие Rust/Chrome явно записать как невыполненную проверку, не как PASS.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/deployment.md docs/frontend-guide.md package.json scripts/check-browser.mjs scripts/check-package-angular.mjs docs/superpowers/specs/2026-11-18-dual-package-build-design.md docs/superpowers/plans/2026-11-18-dual-package-build.md
git commit -m "test: verify both package variants in Angular"
```
