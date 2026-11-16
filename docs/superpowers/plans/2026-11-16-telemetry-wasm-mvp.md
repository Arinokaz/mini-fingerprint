# Telemetry Wasm MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Собрать расширяемый MVP, в котором Angular через локальный TypeScript NPM-пакет вызывает Rust/Wasm-модуль, формирующий обфусцированное значение из API-пути, DOM-атрибута и временного окна, а PHP 8.4 независимо повторяет вычисления и проверяет результат.

**Architecture:** Публичный клиентский API маскируется под маркетинговую телеметрию. Wasm получает API-путь от Angular, самостоятельно читает `window`, `document`, `span.telemetrics_click[data-tag]` и текущее время, выполняет версионированный конвейер собственных 32-битных преобразований и возвращает закодированное время и 256-битный результат в виде 64 hex-символов. PHP 8.4 декодирует время, проверяет допустимое окно и зеркально повторяет все этапы без SHA, HMAC и других готовых хеш-функций.

**Tech Stack:** Rust stable, `wasm-bindgen`, `web-sys`, `js-sys`, `serde`, `serde_json`, `wasm-pack`; TypeScript, локальный NPM workspace; Angular standalone application; PHP 8.4, PHPUnit; Node.js LTS; Playwright.

**Spec:** `readme.md` и уточнённые в обсуждении решения, полностью зафиксированные в этом плане.

## Global Constraints

- Не использовать SHA, MD5, HMAC, `hash()`, `hash_hmac()` или другие готовые алгоритмы хеширования для формирования значения. `hash_equals()` разрешается только для сравнения результата на PHP.
- Внутреннее состояние MVP: восемь независимых 32-битных слов; результат: 256 бит / 64 строчных hex-символа.
- Все вычисления должны побитово повторяться на Rust и PHP 8.4 без `float`, платформенного `int64`, локали и нестабильных сортировок.
- Умножение по модулю `2^32` реализуется через `u32::wrapping_mul()` в Rust и через 16-битные части в PHP.
- Временная метка получается внутри Wasm через `js_sys::Date::now()`; Angular не передаёт текущее время.
- Временное окно: 180 секунд; клиентский пограничный буфер: 15 секунд; сервер допускает предыдущее, текущее и следующее окна.
- Время кодируется обратимыми операциями. PHP сначала восстанавливает окно, затем проверяет TTL и повторяет остальные вычисления.
- API-путь передаётся явно, например `/api/auth/login`; `window.location.pathname` как путь API не используется.
- Wasm ищет `span.telemetrics_click` и читает `data-tag`. При отсутствии элемента, пустом атрибуте или нескольких совпадениях используется встроенное резервное значение, а выполнение продолжается без ошибки.
- PHP использует ожидаемый `data-tag` из конфигурации. Результат с резервным значением не должен совпасть с ожидаемым и получает общий `403` без объяснения причины.
- Фейковые вычисления находятся внутри настоящих рабочих функций. Запрещены отдельные модули и идентификаторы `fake`, `decoy`, `real` и подобные, раскрывающие назначение кода.
- Дополнительные вычисления могут влиять на промежуточные переменные, циклы и выбор веток, но все ветки обязаны давать одинаковый итоговый результат.
- В клиентских публичных и внутренних идентификаторах не использовать слова `token`, `hash`, `signature`, `secret`, `security`, `validate`, `fake`, `decoy`.
- Рабочие названия: `TelemetrySdk`, `getConversionHeaders()`, `calculate_funnel_score()`, `pixel.wasm`, `frame`, `journey`, `touchpoint`, `pulse`, `score`.
- Все исходные модули, классы, функции, поля и конфигурационные переменные Rust и TypeScript получают подробные RustDoc/TSDoc-комментарии; неочевидные локальные переменные и шаги вычислений комментируются inline. Автогенерируемые файлы `wasm-bindgen` вручную не изменяются.
- Production-сборка Angular не публикует source maps.
- MVP не содержит реальной регистрации, входа пользователей, Redis или production-развёртывания. Демонстрационные PHP endpoints только проверяют результат.
- Проект не описывается как криптографическая аутентификация браузера. Wasm, DOM и алгоритм доступны клиенту; решение повышает стоимость анализа, но не создаёт недоступный атакующему секрет.
- Временные окна не предотвращают повторную отправку одного и того же запроса внутри допустимого интервала.

## Review Focus

1. **Расхождение 32-битной арифметики Rust и PHP:** одинаковые входы обязаны давать одинаковые байты после каждого этапа. Это фиксируется общими векторами в задачах 2, 3 и 5.
2. **Поведение при отсутствующем DOM-элементе:** Wasm обязан вернуть внешне корректный результат, а PHP — отклонить его. Это проверяется в задачах 4, 5 и 7.
3. **Обратимость времени и границы окон:** декодирование обязано восстанавливать исходное значение, а 15-секундный буфер — выбирать следующее окно. Тесты находятся в задачах 3, 4 и 5.
4. **Эквивалентность веток с дополнительными вычислениями:** ни одна ветка не должна менять результат. Property-тесты добавляются в задачу 3.
5. **Неоднозначная сериализация дополнительных полей:** имена ограничиваются ASCII, сортируются по байтам, значения кодируются с длиной; дубликаты и превышение лимитов отклоняются. Тесты находятся в задачах 2, 4 и 5.
6. **Производительность обфусцированного кода:** дополнительные циклы не должны блокировать UI; бюджет и бенчмарк добавляются в задачи 3 и 7.

## Target File Structure

```text
/
├── apps/
│   └── demo-web/
│       ├── angular.json
│       └── src/
│           ├── app/
│           │   ├── app.ts
│           │   ├── app.html
│           │   └── conversion-demo.service.ts
│           └── environments/
│               ├── environment.ts
│               ├── environment.development.ts
│               └── environment.staging.ts
├── packages/
│   └── marketing-telemetry/
│       ├── package.json
│       ├── src/
│       │   ├── index.ts
│       │   ├── types.ts
│       │   ├── settings.ts
│       │   ├── runtime.ts
│       │   └── conversion.ts
│       └── tests/
├── crates/
│   └── funnel-wasm/
│       ├── Cargo.toml
│       ├── src/
│       │   ├── lib.rs
│       │   ├── journey.rs
│       │   ├── touchpoint.rs
│       │   ├── pulse.rs
│       │   ├── frame.rs
│       │   ├── stages.rs
│       │   ├── tables.rs
│       │   └── codec.rs
│       └── tests/
├── server/
│   ├── composer.json
│   ├── public/index.php
│   ├── src/Telemetry/
│   │   ├── ConversionCheckpoint.php
│   │   ├── JourneyContext.php
│   │   ├── UInt32.php
│   │   ├── PulseCodec.php
│   │   ├── FrameReducer.php
│   │   ├── FunnelStageInterface.php
│   │   └── Stage/
│   └── tests/
├── contracts/
│   └── conversion-v1.md
├── tests/
│   ├── fixtures/conversion-v1.json
│   └── e2e/conversion.spec.ts
├── scripts/
│   ├── build-wasm.mjs
│   └── dev.mjs
├── docs/
│   ├── architecture.md
│   ├── adding-property.md
│   ├── adding-stage.md
│   └── limitations.md
├── .env.example
├── .gitignore
├── package.json
├── rust-toolchain.toml
└── README.md
```

---

### Task 1: Repository Skeleton and Versioned Contract

**Files:**
- Create: `package.json`, `.gitignore`, `.env.example`, `rust-toolchain.toml`
- Create: `contracts/conversion-v1.md`
- Create: `tests/fixtures/conversion-v1.json`
- Create: `README.md`

**Interfaces:**
- Produces: NPM workspaces `apps/*` and `packages/*`.
- Produces: protocol version `conversion-v1` and shared fixture format consumed by Rust and PHP tests.

- [ ] **Step 1: Initialize repository and pinned tooling**

Initialize Git if it is not initialized. Configure NPM workspaces, Node.js LTS, Rust stable and `wasm32-unknown-unknown`. Add generated Wasm files, `node_modules`, `dist`, `.env`, Angular caches and PHP vendor files to `.gitignore`.

- [ ] **Step 2: Specify canonical input encoding**

Document that additional properties are transported as a JSON array of `[name, value]` pairs rather than an object, so duplicate names remain detectable in both serde and `json_decode()`. Names match `[a-z0-9_.-]{1,64}`, values are UTF-8 strings of at most 512 bytes, and at most 32 properties and 4096 bytes of JSON are accepted. Properties are sorted by ASCII key bytes; every key and value is encoded as a 32-bit little-endian length followed by its bytes. Duplicate property names, invalid UTF-8 and non-string values are rejected. The canonical JSON pair array is encoded with base64url for HTTP transport.

- [ ] **Step 3: Specify frame and output layout**

Document eight `u32` lanes, fixed initial constants, little-endian byte order, fixed substitution/permutation tables and lowercase hexadecimal output in lane order. Define reserved input keys and prohibit clients from overriding the DOM-derived touchpoint.

- [ ] **Step 4: Specify temporal behavior**

Document the 180-second interval, 15-second boundary, current/next client selection and previous/current/next server acceptance. Specify reversible pulse encoding as two `u32` words, its 16-character lowercase hexadecimal representation and the exact inverse operation order. Define profile identifier `cv1`; it is returned by Wasm and transported separately so future pipeline versions can coexist.

- [ ] **Step 5: Create independent golden fixtures**

Include fixed journey `/api/auth/login`, fixed tag, additional properties, timestamps immediately before/inside the boundary, expected canonical bytes, state after every stage, encoded pulse, decoded pulse and final 64-character score. Include missing/empty/duplicate-anchor fallback cases.

- [ ] **Step 6: Commit**

```bash
git add package.json rust-toolchain.toml contracts tests/fixtures README.md .gitignore .env.example
git commit -m "docs: define conversion v1 contract"
```

---

### Task 2: Pure Rust Frame Core and Canonical Codec

**Files:**
- Create: `crates/funnel-wasm/Cargo.toml`
- Create: `crates/funnel-wasm/src/frame.rs`
- Create: `crates/funnel-wasm/src/codec.rs`
- Create: `crates/funnel-wasm/src/tables.rs`
- Create: `crates/funnel-wasm/src/journey.rs`
- Test: `crates/funnel-wasm/tests/frame_tests.rs`
- Test: `crates/funnel-wasm/tests/codec_tests.rs`

**Interfaces:**
- Consumes: `contracts/conversion-v1.md` and `tests/fixtures/conversion-v1.json`.
- Produces: `Frame([u32; 8])`, `Frame::from_journey(&str)`, `Frame::to_hex()`, `CanonicalProperties::parse(&str)` and `CanonicalProperties::write_bytes(&mut Vec<u8>)`.

- [ ] **Step 1: Write failing canonicalization and arithmetic tests**

Load golden fixtures. Assert key ordering, length-prefixed bytes, rejection of duplicate property names and invalid values, wrapping addition, rotations, 16-bit-compatible multiplication and 64-character output. Include inputs containing `:`, empty strings, Cyrillic UTF-8 and maximum-size properties.

- [ ] **Step 2: Run tests and verify failure**

```bash
cargo test --manifest-path crates/funnel-wasm/Cargo.toml
```

Expected: failure because the frame and codec modules are not implemented.

- [ ] **Step 3: Implement the pure core**

Use only `u32`, wrapping arithmetic, XOR, rotations, fixed tables and explicit byte conversion. Parse the JSON pair array into owned strings before sorting and reject duplicate property names. Do not add `hmac`, `sha2`, `md-5` or other hash crates. Keep browser APIs out of these modules so tests run natively. Add detailed comments to constants, lanes, masks and each transformation.

- [ ] **Step 4: Run tests and fixture verification**

```bash
cargo test --manifest-path crates/funnel-wasm/Cargo.toml
```

Expected: all arithmetic, codec and golden-fixture tests pass.

- [ ] **Step 5: Commit**

```bash
git add crates/funnel-wasm
git commit -m "feat: add deterministic frame core"
```

---

### Task 3: Rust Stages, Integrated Extra Work and Pulse Codec

**Files:**
- Create: `crates/funnel-wasm/src/stages.rs`
- Create: `crates/funnel-wasm/src/pulse.rs`
- Modify: `crates/funnel-wasm/src/journey.rs`
- Test: `crates/funnel-wasm/tests/stage_tests.rs`
- Test: `crates/funnel-wasm/tests/pulse_tests.rs`

**Interfaces:**
- Produces:

```rust
pub(crate) trait FunnelStage {
    fn apply(&self, frame: &mut [u32; 8], context: &JourneyContext);
}

pub(crate) fn stages_v1() -> Vec<Box<dyn FunnelStage>>;
pub(crate) fn encode_pulse(window: u64) -> (u32, u32);
pub(crate) fn decode_pulse(parts: (u32, u32)) -> u64;
pub(crate) fn select_window(now_seconds: u64) -> u64;
```

- [ ] **Step 1: Write failing stage and pulse tests**

Use fixture states after every stage. Test that `decode_pulse(encode_pulse(window)) == window`, that less than 15 seconds selects the next window, and that earlier moments select the current window. Add property tests over at least 10,000 deterministic generated frames and windows.

- [ ] **Step 2: Run tests and verify failure**

```bash
cargo test --manifest-path crates/funnel-wasm/Cargo.toml --test stage_tests --test pulse_tests
```

Expected: failure because stages and pulse operations are missing.

- [ ] **Step 3: Implement versioned real stages**

Implement path mixing, touchpoint mixing, property mixing and pulse mixing as separate stage implementations registered only in `stages_v1()`. Every stage accepts the shared context and mutates eight lanes. Adding a future stage must not change the exported Wasm ABI.

- [ ] **Step 4: Integrate additional computations into real stages**

Place bounded additional loops, runtime-derived branch selectors and algebraically equivalent variants directly inside stage methods. Use `#[inline(never)]` on neutral helper methods where appropriate. Do not create decoy/fake modules or identifiers. Ensure the additional values affect intermediate execution but every branch yields the same final frame.

- [ ] **Step 5: Verify branch equivalence and performance**

Test equivalent variants directly over generated frames. Add a criterion or simple timing benchmark with a documented MVP budget: median Wasm call under 10 ms on the development reference machine and no unbounded loops. Run the complete suite.

Expected: fixtures and property tests pass; all branches produce identical output.

- [ ] **Step 6: Commit**

```bash
git add crates/funnel-wasm
git commit -m "feat: add versioned conversion stages"
```

---

### Task 4: Browser Binding and Local TypeScript Package

**Files:**
- Create: `crates/funnel-wasm/src/lib.rs`
- Create: `crates/funnel-wasm/src/touchpoint.rs`
- Create: `packages/marketing-telemetry/package.json`
- Create: `packages/marketing-telemetry/src/types.ts`
- Create: `packages/marketing-telemetry/src/settings.ts`
- Create: `packages/marketing-telemetry/src/runtime.ts`
- Create: `packages/marketing-telemetry/src/conversion.ts`
- Create: `packages/marketing-telemetry/src/index.ts`
- Create: `scripts/build-wasm.mjs`
- Test: `packages/marketing-telemetry/tests/runtime.test.ts`
- Test: `packages/marketing-telemetry/tests/conversion.test.ts`

**Interfaces:**
- Produces Rust/Wasm export:

```rust
#[wasm_bindgen]
pub fn calculate_funnel_score(
    journey: &str,
    properties_json: &str,
) -> Result<String, JsValue>;
```

The returned JSON contains `profile`, `pulse`, `score` and the canonical property pair array in `properties`.

- Produces TypeScript API:

```typescript
export interface TelemetrySettings {
  pixelUrl: string;
}

export class TelemetrySdk {
  constructor(settings: TelemetrySettings);

  getConversionHeaders(
    actionPath: string,
    properties?: Record<string, string>,
  ): Promise<Record<string, string>>;
}
```

- Produces headers: `X-GA-Measurement-Id` for profile `cv1`, `X-GA-Session-Id` for the 16-character encoded pulse, `X-Amplitude-Device-Id` for score, `X-Amplitude-Session-Properties` for base64url-encoded canonical properties and `X-YM-Counter-Client` for static telemetry noise.

- [ ] **Step 1: Write failing TypeScript loader and facade tests**

Mock the Wasm facade. Assert lazy initialization, reuse of one initialization promise for concurrent calls, retry after failed loading, correct headers and no direct timestamp argument. Assert that a returned score is forwarded unchanged.

- [ ] **Step 2: Run TypeScript tests and verify failure**

```bash
npm test --workspace @company/marketing-telemetry
```

Expected: failure because the package API is not implemented.

- [ ] **Step 3: Implement browser touchpoint collection**

Inside Wasm, call `window()`, `document()` and `query_selector_all("span.telemetrics_click")`. Use a non-empty `data-tag` only when exactly one matching element exists. In every other case use the embedded fallback and continue. Missing DOM must not produce a Wasm exception.

- [ ] **Step 4: Implement Wasm entry point and TypeScript facade**

Get time with `js_sys::Date::now()` inside Wasm. Convert the TypeScript `Record` to a JSON pair array, parse properties, select and encode the window, execute `stages_v1()`, and return the JSON result with profile `cv1`. TypeScript owns only lazy loading, API calls, base64url property encoding and header mapping. Use telemetry terminology throughout and add detailed TSDoc/RustDoc comments.

- [ ] **Step 5: Build and test package**

```bash
npm run build:wasm
npm test --workspace @company/marketing-telemetry
npm run build --workspace @company/marketing-telemetry
```

Expected: `pixel.wasm` and JavaScript glue are generated; TypeScript tests and build pass.

- [ ] **Step 6: Commit**

```bash
git add crates/funnel-wasm packages/marketing-telemetry scripts/build-wasm.mjs package-lock.json
git commit -m "feat: expose browser telemetry package"
```

---

### Task 5: PHP 8.4 Mirror Implementation

**Files:**
- Create: `server/composer.json`
- Create: `server/src/Telemetry/UInt32.php`
- Create: `server/src/Telemetry/PulseCodec.php`
- Create: `server/src/Telemetry/JourneyContext.php`
- Create: `server/src/Telemetry/FunnelStageInterface.php`
- Create: `server/src/Telemetry/Stage/*.php`
- Create: `server/src/Telemetry/FrameReducer.php`
- Create: `server/src/Telemetry/ConversionCheckpoint.php`
- Test: `server/tests/UInt32Test.php`
- Test: `server/tests/PulseCodecTest.php`
- Test: `server/tests/FrameReducerTest.php`
- Test: `server/tests/ConversionCheckpointTest.php`

**Interfaces:**
- Consumes: `conversion-v1` fixtures and canonical property format.
- Produces:

```php
public function matches(
    string $profile,
    string $journey,
    string $pulse,
    string $score,
    string $propertiesJson,
    int $serverTime,
): bool;
```

- [ ] **Step 1: Write failing PHP arithmetic and fixture tests**

Load exactly the same JSON fixtures as Rust. Assert every intermediate frame, pulse encoding/decoding, canonical bytes and final score. Include multiplication near `0xffffffff`, high-bit rotations and UTF-8 values.

- [ ] **Step 2: Run PHPUnit and verify failure**

```bash
cd server && composer install && vendor/bin/phpunit
```

Expected: failure because mirror classes are not implemented.

- [ ] **Step 3: Implement explicit PHP 32-bit arithmetic**

Represent words as PHP integers in the range `0..0xffffffff`. Implement addition with masks and multiplication through 16-bit limbs so no operation overflows into `float`. Avoid GMP, floats and platform-dependent shifts. Add comments to every helper and limb variable.

- [ ] **Step 4: Mirror stages and temporal validation**

Implement the same stage order and constants as Rust. Accept only profile `cv1`, decode pulse, check previous/current/next windows relative to `$serverTime`, use the actual request route as `$journey`, load expected `data-tag` from server configuration and compare the resulting score with `hash_equals()`. Parse the decoded JSON pair array and reject duplicate property names before sorting. Return only `bool` to callers.

- [ ] **Step 5: Add negative and differential tests**

Test invalid hexadecimal, wrong length, malformed JSON, excessive properties, old/future pulse, changed journey, changed property, wrong expected tag and fallback-derived fixtures. Run PHPUnit and Rust tests together.

Expected: all vectors match; every invalid case returns `false` without warnings or uncaught exceptions.

- [ ] **Step 6: Commit**

```bash
git add server tests/fixtures
git commit -m "feat: mirror conversion protocol in PHP"
```

---

### Task 6: Minimal PHP Endpoints and Angular Demo

**Files:**
- Create: `server/public/index.php`
- Create: `apps/demo-web/src/app/app.ts`
- Create: `apps/demo-web/src/app/app.html`
- Create: `apps/demo-web/src/app/conversion-demo.service.ts`
- Create: `apps/demo-web/src/environments/*.ts`
- Create: `apps/demo-web/angular.json`
- Test: `apps/demo-web/src/app/conversion-demo.service.spec.ts`

**Interfaces:**
- Consumes: `TelemetrySdk.getConversionHeaders()` and `ConversionCheckpoint::matches()`.
- Produces: `/api/auth/login` and `/api/auth/register` demonstration routes.

- [ ] **Step 1: Write failing Angular service tests**

Assert that login and register pass their exact API paths to `TelemetrySdk`, forward returned headers and display only generic success/failure states.

- [ ] **Step 2: Implement PHP routes**

Read the camouflaged headers, impose request/header size limits, strictly base64url-decode the properties header, and call `ConversionCheckpoint::matches()` with the profile, actual route, decoded pulse, score, canonical properties JSON and server time. Return `200` on success or the same generic `403` on every validation failure. Do not implement real account creation or authentication.

- [ ] **Step 3: Implement one Angular page**

Add email/password inputs and `login`/`register` buttons. Include one `<span class="telemetrics_click" data-tag="..."></span>` whose value comes from the current environment. Keep the element hidden with CSS. On click, generate headers just-in-time and send the request.

- [ ] **Step 4: Configure development proxy and environments**

Proxy `/api` to the local PHP server to avoid unnecessary CORS. Define development, staging and production values for the tag and `pixelUrl`; production disables source maps. Ensure the expected PHP tag comes from `.env`, not from a copied client response header.

- [ ] **Step 5: Run unit and production-build checks**

```bash
npm test --workspace demo-web
npm run build --workspace demo-web -- --configuration=production
cd server && vendor/bin/phpunit
```

Expected: tests pass; production build contains `pixel.wasm` and no source maps.

- [ ] **Step 6: Commit**

```bash
git add apps/demo-web server .env.example
git commit -m "feat: add Angular and PHP demo flow"
```

---

### Task 7: Unified Build and End-to-End Tests

**Files:**
- Create: `scripts/dev.mjs`
- Modify: `scripts/build-wasm.mjs`
- Create: `tests/e2e/conversion.spec.ts`
- Create: `playwright.config.ts`
- Modify: root `package.json`

**Interfaces:**
- Produces: `npm run dev`, `npm run build`, `npm test`, `npm run test:e2e`.

- [ ] **Step 1: Write positive E2E scenarios**

Launch Angular and PHP. Verify that login and register return `200`, `X-Amplitude-Device-Id` contains exactly 64 lowercase hex characters, and the network request does not contain a plaintext timestamp.

- [ ] **Step 2: Write negative and boundary E2E scenarios**

Verify modified score, replayed score for a different route, stale pulse and malformed properties return `403`. Remove the anchor, empty its `data-tag` and add a duplicate anchor in separate tests; each time Wasm must still produce a request and PHP must return `403`, with no browser exception.

- [ ] **Step 3: Test production browser integration**

Build Angular in production mode, serve static files, load real `pixel.wasm` and run the successful login scenario. Cover Chromium and Firefox; add WebKit if supported by the environment.

- [ ] **Step 4: Add performance observation**

Measure Wasm call duration from the browser test, record median and p95, and fail only on the agreed generous regression ceiling rather than machine-specific microbenchmark noise. Confirm additional loops remain bounded.

- [ ] **Step 5: Run the complete verification suite**

```bash
npm run build:wasm
cargo test --manifest-path crates/funnel-wasm/Cargo.toml
(cd server && composer test)
npm test
npm run build
npm run test:e2e
```

Expected: all commands exit with code 0 and all E2E scenarios pass.

- [ ] **Step 6: Commit**

```bash
git add scripts tests package.json package-lock.json playwright.config.ts
git commit -m "test: verify complete telemetry flow"
```

---

### Task 8: Documentation and MVP Acceptance

**Files:**
- Create: `docs/architecture.md`
- Create: `docs/adding-property.md`
- Create: `docs/adding-stage.md`
- Create: `docs/limitations.md`
- Modify: `README.md`

- [ ] **Step 1: Document operation and extension flows**

Describe the Angular → NPM → Wasm → PHP flow, exact header mapping, build commands and test commands. Document that source comments are for maintainers and are not shipped in the Wasm binary.

- [ ] **Step 2: Document adding a property**

Adding a property requires passing it through `properties`, permitting its ASCII name in the protocol, mirroring any server-derived expectation and adding a fixture. The exported Wasm function and `TelemetrySdk.getConversionHeaders()` signature remain unchanged.

- [ ] **Step 3: Document adding a stage**

Adding a stage requires a Rust `FunnelStage`, a PHP `FunnelStageInterface`, registration in a new pipeline version, intermediate golden vectors, property tests and E2E verification. Additional obfuscating work remains inside neutral working functions rather than a separately identifiable layer.

- [ ] **Step 4: Document limitations**

State explicitly: public Wasm can be executed or reverse-engineered; `data-tag` is public; fallback is not proof of fraud by itself; 256 output bits do not make a custom algorithm cryptographically secure; time windows permit replay inside their validity period; heavy obfuscation must not harm UX.

- [ ] **Step 5: Perform final clean-checkout verification**

Clone or copy the project into a clean directory, install dependencies using lockfiles, run every command from Task 7 Step 5 and verify that no generated file must be edited manually.

- [ ] **Step 6: Commit**

```bash
git add docs README.md
git commit -m "docs: explain extension and limitations"
```

---

## MVP Acceptance Criteria

- `npm run build:wasm` produces a working `pixel.wasm` without SHA/HMAC dependencies.
- The local `@company/marketing-telemetry` package builds and requires no external NPM registry.
- Rust and TypeScript source files contain detailed comments as specified in Global Constraints.
- One Angular page provides working login and register demonstration actions.
- Wasm obtains time and DOM data internally and accepts the API path from Angular.
- Missing, empty or duplicate DOM anchors do not cause a Wasm error; resulting requests are rejected by PHP.
- The result contains eight mirrored 32-bit lanes and exactly 64 lowercase hex characters.
- PHP 8.4 reproduces every intermediate and final value without floating-point arithmetic or ready-made hash functions.
- The encoded time is reversible and previous/current/next window behavior passes boundary tests.
- Mutating the journey, tag, pulse or any property in the test fixtures causes rejection.
- Extra computations are embedded in working stages, have no separately identifiable fake layer and do not change outputs.
- Adding properties does not change the Wasm ABI; adding stages is isolated to versioned Rust/PHP registries and fixtures.
- Development and production builds work; production has no public source maps.
- All Rust, TypeScript, PHPUnit and Playwright tests pass from a clean checkout.

## Post-MVP Priorities

1. Bind the calculation to the HTTP method and raw request-body bytes.
2. Add an optional one-time server challenge to prevent replay; this requires server-side state.
3. Introduce pipeline and build rotation with backward-compatible version windows.
4. Add more properties and custom stages using the documented extension process.
5. Roll out in observation-only mode before enabling rejection for real traffic.
6. Add account/device/network rate limiting independently of the Wasm mechanism.
7. Profile additional integrated computations on low-end mobile devices before increasing their volume.
8. Periodically test differential Rust/PHP behavior on randomized and fuzzed inputs.

## Estimated Effort

Approximately **8–12 working days** for a developer familiar with the stack, excluding production rollout. Additional time is required if the implementer is learning Rust/Wasm or PHP fixed-width arithmetic for the first time.
