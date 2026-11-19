# Wasm Click Sampling and Angular 16 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести demo и package-проверки на Angular 16, затем выпустить `cv2` с нейтральным `clickId`, настраиваемым `scorePrefix = "00"` и перебором внутри Wasm.

**Architecture:** Сначала существующий `cv1` переводится на Angular 16 без изменения протокола. Затем чистое Rust-ядро получает 128-битный `ClickId`, отдельную click-стадию и детерминированный поиск результата; browser binding только собирает окружение, а TypeScript-фасад передаёт настройку и добавляет шестой analytics-заголовок. `cv1` и его fixtures остаются неизменными.

**Tech Stack:** Angular 16.2, TypeScript 5.1, Node.js 18, Rust stable, wasm-bindgen/web-sys, Angular functional interceptors, Node test runner, existing Chrome DevTools browser checks.

**Spec:** `docs/superpowers/specs/2026-11-19-wasm-click-sampling-design.md`

## Global Constraints

- `cv1` нельзя изменять на месте; его контракт, fixtures и тесты остаются действующими.
- Wasm после доработки возвращает `profile = "cv2"`; новый заголовок — `X-Amplitude-Event-Id` с 32 lowercase hex.
- `clickId` — четыре `u32`, 16 байт little-endian; инкремент modulo `2^128` с переносом от слова 0 к слову 3.
- Click-стадия использует domain `0xc1`, 4 раунда и находится между properties и pulse.
- Поддерживаются только префиксы `""`, `"0"`, `"00"`, `"000"`; значение по умолчанию — `"00"`.
- Перебор выполняется внутри Wasm; timestamp и frame после properties вычисляются один раз на вызов.
- Начальный `clickId` формируется без `crypto.getRandomValues()` и без cryptographic API.
- Публичные JS/declarations не содержат `nonce`, `challenge`, `proofOfWork`, `mining`, `token` (кроме Angular `InjectionToken`), `secret` и явных cryptographic названий.
- Не реализуются TypeScript-копия алгоритма, PHP, replay-cache, IP-политика, challenge API и привязка тела/метода запроса.
- Demo, isolated package consumers, declarations и browser runtime проверяются на Angular 16.2, TypeScript 5.1 и Node.js 18.
- TypeScript target demo, пакета и esbuild — ES2020; peer dependencies пакета — Angular `>=16 <17`, RxJS `^7.8.0`.
- Interceptor по-прежнему обрабатывает все `HttpClient`-запросы без allowlist критических маршрутов.

## Review Focus

1. **Два вызова в одну секунду:** они не обязаны быть одинаковыми; каждый получает последовательность поиска со своим начальным `clickId`. Проверка добавляется в Tasks 5–6.
2. **Перенос и wrap 128-битного идентификатора:** `ffffffff` в младших словах не должен терять перенос, а полный wrap возвращает нулевые слова. Проверка добавляется в Task 2.
3. **Неверная конфигурация префикса:** ненулевые символы и длина больше трёх отклоняются до начала вычисления. Проверки добавляются в Tasks 2 и 5.
4. **Повторное использование работы:** смена только `clickId` не должна заново выполнять journey/touchpoint/properties или менять timestamp. Проверка промежуточных frame и попыток добавляется в Task 3.
5. **Angular 16 toolchain:** production output, Zone.js и isolated `.tgz` consumers должны работать на Node.js 18, а не случайно использовать hoisted Angular 21/TypeScript 5.9. Проверки добавляются в Tasks 1 и 6.
6. **Маскировка артефакта:** случайные совпадения внутри base64 не должны вызывать ложные срабатывания, но новые revealing-термины в JS/declarations должны отклоняться. Проверка добавляется в Task 6.

---

### Task 1: Angular 16 Baseline Without Protocol Changes

**Files:**
- Create: `apps/demo-web/tests/toolchain.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `apps/demo-web/package.json`
- Modify: `apps/demo-web/angular.json`
- Modify: `apps/demo-web/src/main.ts`
- Modify: `apps/demo-web/tsconfig.json`
- Modify: `packages/marketing-telemetry/package.json`
- Modify: `packages/marketing-telemetry/tsconfig.json`
- Modify: `packages/marketing-telemetry/scripts/build.mjs`
- Modify: `packages/marketing-telemetry/tests/package-contents.test.ts`
- Modify: `scripts/check-browser.mjs`

**Interfaces:**
- Consumes: существующий рабочий `cv1`, generated `pkg/` и `generated-pixel.ts`.
- Produces: тот же `cv1` API и те же пять заголовков на Angular 16.2; Node.js 18 build baseline для всех последующих задач.

- [ ] **Step 1: Активировать Node.js 18 и написать failing toolchain tests**

Использовать существующий version manager или локально размещённый Node.js 18; не менять системный Node.js. `node --version` должен показать `v18.x`.

В `toolchain.test.ts` читать manifests и `angular.json`; проверить Angular `^16.2.0`, TypeScript `5.1`, Node engine `^18.10.0`, Zone.js polyfill, отсутствие `@angular/build` и ES2020 target. В `package-contents.test.ts` проверить peer range Angular `>=16 <17`.

- [ ] **Step 2: Запустить tests и подтвердить ожидаемый failure**

Run: `npm test --workspace demo-web && npm test --workspace @company/marketing-telemetry`
Expected: FAIL на Angular 21/Node 24/ES2022/текущем peer range; существующие поведенческие assertions не менять.

- [ ] **Step 3: Перевести toolchain на Angular 16**

В demo использовать Angular 16.2, `@angular/cli` 16.2, `@angular-devkit/build-angular` 16.2, TypeScript 5.1 и Zone.js 0.13. Убрать `provideZonelessChangeDetection`, подключить `zone.js` в polyfills. Перевести build/serve на поддерживаемые Angular 16 builders и сохранить output `dist/demo-web/browser` через явный `outputPath`.

В корне зафиксировать Node `^18.10.0`; в пакете использовать TypeScript 5.1, ES2020 и Angular peer `>=16 <17`. Добавить `undici` 6.x как dev dependency и импортировать его `WebSocket` в `check-browser.mjs`, поскольку Node.js 18 не предоставляет используемый текущим тестом глобальный WebSocket. Выполнить `npm install` под Node.js 18, обновив lockfile.

- [ ] **Step 4: Проверить неизменный cv1 на новом toolchain**

Run:
```bash
npm ls @angular/core @angular/cli typescript
npm test
npm run build
npm run test:browser
```
Expected: Angular 16.2/TypeScript 5.1; все существующие tests PASS; production и browser checks PASS с прежними cv1 golden headers.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json apps/demo-web packages/marketing-telemetry scripts/check-browser.mjs
git commit -m "chore: establish Angular 16 build baseline"
```

### Task 2: `cv2` Contract and ClickId Primitive

**Files:**
- Create: `contracts/conversion-v2.md`
- Create: `tests/fixtures/conversion-v2.json`
- Create: `crates/funnel-wasm/src/click.rs`
- Create: `crates/funnel-wasm/tests/click_tests.rs`
- Modify: `crates/funnel-wasm/src/lib.rs`
- Modify: `scripts/check-contract.mjs`

**Interfaces:**
- Produces:
```rust
pub struct ClickId(pub [u32; 4]);
impl ClickId {
    pub const fn from_words(words: [u32; 4]) -> Self;
    pub const fn to_le_bytes(self) -> [u8; 16];
    pub const fn incremented(self) -> Self;
    pub fn from_hex(value: &str) -> Result<Self, ClickIdError>;
    pub fn to_hex(self) -> String;
}
pub fn validate_score_prefix(value: &str) -> Result<(), ClickIdError>;
```
- Consumes: неизменные constants/operations из `cv1`; `cv2` добавляет `click` domain `c1` и rounds 4.

- [ ] **Step 1: Написать failing primitive и contract tests**

Проверить round-trip `000102...` ↔ 16 bytes ↔ 32 hex; перенос `[0xffffffff, 0, 0, 0]` → `[0, 1, 0, 0]`; полный `[0xffffffff; 4]` → `[0; 4]`; принятие четырёх разрешённых префиксов; отклонение `"1"`, `"0000"`, `"00a"`, `"0O"`.

`check-contract.mjs` должен валидировать оба profiles. Для каждого cv2 case требуются `scorePrefix`, `initialClickId`, `clickId`, `attempts >= 1`, пять стадий и `score.startsWith(scorePrefix)`.

- [ ] **Step 2: Запустить tests и подтвердить failure**

Run:
```bash
cargo test --manifest-path crates/funnel-wasm/Cargo.toml --test click_tests
node scripts/check-contract.mjs
```
Expected: FAIL из-за отсутствующих ClickId API и cv2 fixtures.

- [ ] **Step 3: Задокументировать cv2 и реализовать ClickId**

Скопировать нормативные общие операции cv1 без изменения; добавить clickId bytes, стадию, префикс, формат runtime JSON и шестой заголовок. Создать независимые cv2 fixtures для valid/missing DOM и префиксов `""`, `"0"`, `"00"`, `"000"`; каждый case содержит начальное и финальное значение, точное число попыток и промежуточные lanes.

Реализовать только primitive и validation в `click.rs`; поиск относится к Task 3. Экспортировать модуль из `lib.rs` для native integration tests, не добавляя второй Wasm export.

- [ ] **Step 4: Запустить primitive/contract и regression tests**

Run:
```bash
cargo test --manifest-path crates/funnel-wasm/Cargo.toml --test click_tests
node scripts/check-contract.mjs
cargo test --manifest-path crates/funnel-wasm/Cargo.toml --test stage_tests --test pulse_tests
```
Expected: PASS; cv1 fixtures не изменены.

- [ ] **Step 5: Commit**

```bash
git add contracts/conversion-v2.md tests/fixtures/conversion-v2.json crates/funnel-wasm/src/click.rs crates/funnel-wasm/src/lib.rs crates/funnel-wasm/tests/click_tests.rs scripts/check-contract.mjs
git commit -m "feat: define cv2 click identifier contract"
```

### Task 3: Click Stage and Deterministic Search Core

**Files:**
- Create: `crates/funnel-wasm/src/sampling.rs`
- Create: `crates/funnel-wasm/tests/sampling_tests.rs`
- Create: `crates/funnel-wasm/tests/stage_v2_tests.rs`
- Modify: `crates/funnel-wasm/src/stages.rs`
- Modify: `crates/funnel-wasm/src/lib.rs`

**Interfaces:**
- Consumes: `ClickId`, `validate_score_prefix`, `JourneyContext`, `Frame`, `CanonicalProperties` из Task 2.
- Produces:
```rust
pub fn stages_v2(click_id: ClickId) -> Vec<Box<dyn FunnelStage>>;

pub struct ClickSample {
    pub click_id: ClickId,
    pub score: String,
    pub attempts: u64,
}

pub fn sample_v2(
    context: &JourneyContext,
    initial: ClickId,
    score_prefix: &str,
) -> Result<ClickSample, ClickIdError>;
```

- [ ] **Step 1: Написать failing stage/search tests**

Для каждого cv2 fixture применить `stages_v2(case.clickId)` и сравнить все пять frames и score. Отдельно вызвать `sample_v2(context, initialClickId, scorePrefix)` и сравнить финальный clickId, score и attempts. Проверить, что `""` завершается за одну попытку, а каждый принятый score имеет требуемый prefix.

Добавить instrumentation test вокруг чистых стадий: prefix frame после properties одинаков для всех попыток, pulse использует исходный `JourneyContext.timestamp()` независимо от числа попыток.

- [ ] **Step 2: Запустить tests и подтвердить failure**

Run: `cargo test --manifest-path crates/funnel-wasm/Cargo.toml --test stage_v2_tests --test sampling_tests`
Expected: FAIL из-за отсутствующих `stages_v2` и `sample_v2`.

- [ ] **Step 3: Реализовать click-стадию и поиск**

`ClickStage(ClickId)` поглощает `click_id.to_le_bytes()` с domain `0xc1`, 4 rounds и существующим `settle_frame`. `stages_v2` возвращает journey/touchpoint/properties/click/pulse.

`sample_v2` валидирует prefix, один раз применяет первые три стадии, затем для каждого ClickId применяет click/pulse к копии prefix frame. Возвращает первый подходящий результат и 1-based attempts. Не вызывать browser APIs и не читать время внутри цикла.

- [ ] **Step 4: Запустить все Rust tests**

Run: `cargo test --manifest-path crates/funnel-wasm/Cargo.toml`
Expected: все cv1/cv2 unit и integration tests PASS, включая существующие 10 000-frame property tests.

- [ ] **Step 5: Commit**

```bash
git add crates/funnel-wasm
git commit -m "feat: add deterministic cv2 click sampling"
```

### Task 4: Browser Seed and Wasm `cv2` Entry Point

**Files:**
- Modify: `crates/funnel-wasm/src/click.rs`
- Modify: `crates/funnel-wasm/src/lib.rs`
- Modify: `crates/funnel-wasm/Cargo.toml`
- Modify: `packages/marketing-telemetry/tests/pixel.integration.test.ts`

**Interfaces:**
- Consumes: `sample_v2` из Task 3.
- Produces Wasm export:
```rust
calculate_funnel_score(journey: &str, properties_json: &str, score_prefix: &str)
```
Runtime JSON добавляет `clickId` и использует `profile = "cv2"`.

- [ ] **Step 1: Написать failing real-Wasm integration test**

Зафиксировать `Date.now`, `performance.now` и последовательность `Math.random`. Для первого вызова передать fixture prefix и проверить `cv2`, известный clickId/pulse/score и шесть заголовков после Task 5 либо, до изменения facade, непосредственно разобрать runtime JSON. Второй вызов не сравнивать на равенство с первым: счётчик вызовов должен дать другую отправную последовательность.

- [ ] **Step 2: Запустить test и подтвердить failure**

Run: `npm run build:wasm && npm test --workspace @company/marketing-telemetry -- --test-name-pattern="real Wasm"`
Expected: FAIL из-за старого ABI и `cv1` payload.

- [ ] **Step 3: Реализовать нейтральный browser seed и cv2 binding**

Использовать четыре значения `Math.random()` как исходные слова: `floor(random * 2^32)`. Затем:

```text
word0 XOR low32(Date.now milliseconds)
word1 XOR high32(Date.now milliseconds)
word2 XOR low32(floor(performance.now() * 1000))
word3 XOR runtimeCallCounter
```

Counter начинается с 0 и увеличивается на один для каждого вызова. Date.now читается один раз; timestamp — `floor(milliseconds / 1000)`. Добавить только необходимый web-sys `Performance` feature.

Wasm binding вызывает `sample_v2` и возвращает profile/clickId/pulse/score/properties. Не добавлять cryptographic imports или новый публичный Wasm export.

- [ ] **Step 4: Проверить Rust и real-Wasm integration**

Run:
```bash
cargo test --manifest-path crates/funnel-wasm/Cargo.toml
npm run build:wasm
npm test --workspace @company/marketing-telemetry -- --test-name-pattern="real Wasm"
```
Expected: PASS; второй вызов имеет другой clickId, а timestamp остаётся fixture timestamp.

- [ ] **Step 5: Commit**

```bash
git add crates/funnel-wasm packages/marketing-telemetry/tests/pixel.integration.test.ts
git commit -m "feat: generate cv2 samples in browser wasm"
```

### Task 5: Configurable TypeScript Facade and Six Headers

**Files:**
- Modify: `packages/marketing-telemetry/src/types.ts`
- Modify: `packages/marketing-telemetry/src/settings.ts`
- Modify: `packages/marketing-telemetry/src/conversion.ts`
- Modify: `packages/marketing-telemetry/src/angular-interceptor.ts`
- Modify: `packages/marketing-telemetry/src/index.ts`
- Modify: `packages/marketing-telemetry/tests/conversion.test.ts`
- Modify: `packages/marketing-telemetry/tests/angular-interceptor.test.ts`
- Modify: `packages/marketing-telemetry/tests/pixel.integration.test.ts`

**Interfaces:**
- Produces:
```typescript
export interface TelemetrySettings {
  conversion?: { scorePrefix?: string };
}

constructor(settings?: TelemetrySettings, loader?: RuntimeLoader);

calculate_funnel_score(
  journey: string,
  propertiesJson: string,
  scorePrefix: string,
): string;

export const TELEMETRY_SETTINGS: InjectionToken<TelemetrySettings>;
```
- `ConversionPayload` добавляет `clickId: string`; `PixelRuntime` использует новую сигнатуру; публичный `getConversionHeaders()` не меняется.

- [ ] **Step 1: Написать failing facade/interceptor tests**

Проверить передачу default `"00"` и custom `"000"` третьим аргументом; отклонение `"0000"` и `"0x"` до loader; строгую проверку `clickId` и `profile = "cv2"`; `X-Amplitude-Event-Id` в результате; удаление всех шести заголовков после ошибки; сохранение concurrent initialization.

Для Angular settings token проверить, что root SDK создаётся с provided settings. Два вызова в одну секунду не сравнивать по полному набору заголовков.

- [ ] **Step 2: Запустить package tests и подтвердить failure**

Run: `npm test --workspace @company/marketing-telemetry`
Expected: FAIL на отсутствующих settings/clickId/шестом заголовке.

- [ ] **Step 3: Реализовать facade и Angular configuration**

Добавить default `DEFAULT_SCORE_PREFIX = "00"` и header constant. Constructor принимает settings первым аргументом и optional loader вторым; default settings применяются без изменения объекта caller. Валидировать prefix в facade с той же грамматикой, что Rust.

`TELEMETRY_SETTINGS` имеет root-factory `{}`; `TELEMETRY_SDK` factory инжектирует settings. Экспортировать публичные settings/token/type из `index.ts`. Runtime response требует ровно валидные cv2 fields, включая `/^[0-9a-f]{32}$/` для clickId.

- [ ] **Step 4: Запустить TypeScript и real-Wasm tests**

Run: `npm test --workspace @company/marketing-telemetry`
Expected: все package tests PASS; real-Wasm integration использует публичный facade и проверяет шесть заголовков.

- [ ] **Step 5: Commit**

```bash
git add packages/marketing-telemetry
git commit -m "feat: expose configurable cv2 telemetry headers"
```

### Task 6: Angular 16 Release, Browser Golden Checks and Documentation

**Files:**
- Modify: `scripts/check-browser.mjs`
- Modify: `packages/marketing-telemetry/tests/release.test.ts`
- Modify: `packages/marketing-telemetry/tests/package-contents.test.ts`
- Modify: `packages/marketing-telemetry/scripts/artifact-rules.mjs`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/deployment.md`
- Modify: `docs/frontend-guide.md`
- Modify: `docs/php-developer-guide.md`
- Modify: `docs/php-mirror-pseudocode.md`
- Modify: `docs/modules/angular-demo.md`
- Modify: `docs/modules/rust-wasm.md`
- Modify: `docs/modules/telemetry-package.md`
- Modify: `docs/post-implementation-ideas.md`

**Interfaces:**
- Consumes: полный cv2 Wasm/facade из Tasks 2–5 и Angular 16 baseline из Task 1.
- Produces: проверенные embedded/lazy `.tgz`, обновлённые browser fixtures/assertions и документация для Angular 16.

- [ ] **Step 1: Добавить failing artifact-scanner test**

В `release.test.ts` проверить, что `nonce`, `challenge`, `proofOfWork`, `mining` и `getRandomValues` отклоняются в обычном JS, а те же случайные последовательности внутри длинного base64 literal игнорируются. Angular `InjectionToken` остаётся единственным token exception.

- [ ] **Step 2: Запустить scanner test и подтвердить failure**

Run: `npm run test:release --workspace @company/marketing-telemetry`
Expected: FAIL на новых revealing-терминах до расширения scanner.

- [ ] **Step 3: Обновить scanner, browser/release assertions и документацию**

Расширить artifact scanner новыми терминами. Browser check должен фиксировать Date/performance/Math.random до загрузки страницы, использовать cv2 fixtures и проверять точные clickId/score/pulse для известного runtime call counter. Missing/empty/duplicate DOM используют разные вызовы и не обязаны иметь одинаковый score; сравнивать каждый с собственным fixture. Проверять шестой заголовок и prefix во всех запросах.

Release test должен проверять первый deterministic вызов каждого variant по fixture, не требовать равенства двух concurrent вызовов и проверять одинаковые последовательности embedded/lazy при одинаково зафиксированном окружении.

Зафиксировать browser seed без production test hooks. Добавить наблюдение attempts/duration и вывод median/p95 без машинно-зависимого жёсткого лимита. Обновить CORS-список шестью заголовками, contract status, Angular 16/Node 18/TypeScript 5.1 requirements, default `"00"`, ручные/Angular settings и ограничение replay.

В `post-implementation-ideas.md` оставить риск/IP/TypeScript-only как последующие работы; текущий cv2 не утверждать как реализованную backend-политику.

- [ ] **Step 4: Запустить полный release и Angular 16 verification**

Run под Node.js 18:
```bash
node scripts/check-contract.mjs
cargo test --manifest-path crates/funnel-wasm/Cargo.toml
npm test
npm run build
npm run test:browser
npm run build:npm
npm run test:release --workspace @company/marketing-telemetry
npm run test:package:angular
```
Expected: все команды exit 0; isolated consumers показывают Angular 16.2/TypeScript 5.1; оба варианта отправляют одинаковые cv2 golden headers; `.wasm` network requests отсутствуют; `git diff --check` не выводит ошибок.

- [ ] **Step 5: Зафиксировать измеренный baseline**

Добавить в документацию фактические размеры из `release/size-report.json` и наблюдаемые median/p95 для default `"00"` без обещания одинакового времени на других устройствах. Не повышать prefix автоматически.

- [ ] **Step 6: Commit**

```bash
git add README.md docs scripts packages/marketing-telemetry
git commit -m "test: verify cv2 packages on Angular 16"
```
