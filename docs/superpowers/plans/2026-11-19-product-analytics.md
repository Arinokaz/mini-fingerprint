# Product Analytics `pa1` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать независимый TypeScript npm-пакет `@company/product-analytics` с проверяемым `pa1` score, пятью заголовками, DOM marker, graphics/engagement snapshot и Angular 16 demo, сохранив существующий Wasm `cv2` без изменений.

**Architecture:** Чистый TypeScript core вычисляет 128-битный `pa1` из pathname, DOM view marker, viewId/eventId и timestamp. Environment adapters один раз собирают graphics, локально накапливают engagement и на каждый запрос формируют компактный snapshot, связанный со score через eventId. Angular providers заранее запускают listeners, а два независимых interceptor добавляют одиннадцать заголовков от двух analytics-пакетов.

**Tech Stack:** TypeScript 5.1, Angular 16.2, Node.js 18.17+, ES2020, RxJS 7.8.1, esbuild, Node test runner, existing Chromium/CDP browser checks.

**Spec:** `docs/superpowers/specs/2026-11-19-product-analytics-design.md`

## Global Constraints

- Wasm `cv2`, его алгоритм, headers и fixtures не изменяются.
- Новый пакет не импортирует Rust/Wasm conversion core и не повторяет его алгоритм.
- Новые пакет, контракт и fixtures: `@company/product-analytics`, `pa1`, `contracts/product-analytics-v1.md`, `tests/fixtures/product-analytics-v1.json`.
- Пять headers: `X-PA-Measurement-Id`, `X-PA-Session-Id`, `X-PA-Device-Id`, `X-PA-Event-Id`, `X-PA-Session-Properties`.
- Ровно один новый DOM element: `canvas.analytics_stage[data-view]`; fallback — `analytics.unresolved.v1`.
- Score — четыре `u32`, 32 lowercase hex; timestamp pulse — 16 lowercase hex; eventId/viewId — 32 lowercase hex.
- Analytics snapshot не участвует в score; связь обеспечивается общим eventId из одного набора headers.
- Graphics categories: 0 unknown, 1 standard, 2 software, 3 unavailable. Полные GPU strings наружу не передаются.
- Engagement: `[active,countBucket,categoryMask,ageBucket]`; age — возраст view, не последнее событие.
- Только mousemove/keydown/touchstart/scroll меняют active/count; focus/blur/visibilitychange меняют только category bits.
- Snapshot полностью отправляется каждый раз: raw <=1024 bytes, base64url <=1400 bytes, все пять headers <=2 KB.
- Нет raw events, Canvas pixel hashes, полных GPU strings, webdriver/isTrusted/permissions probes и дополнительного network endpoint.
- Angular 16.2, TypeScript 5.1, Node.js `^18.17.0`, ES2020; package peer Angular `>=16 <17`, RxJS `^7.8.0`.
- Все новые TSDoc, комментарии и документация — на русском; исторические документы не переписываются.
- Internal Feature Processor остаётся документированным отложенным skeleton без backend/Go/queue/storage реализации.

## Review Focus

1. **Пустое engagement-состояние:** focus/visibility без qualifying input не должны делать active=1 или увеличивать count. Проверка в Task 2.
2. **Privacy/masked graphics:** отсутствие extension или generic renderer означает unknown, а не standard/unavailable. Проверка в Task 2.
3. **Независимость ошибок:** падение Wasm не должно удалять pa1 headers, а ошибка pa1 не должна удалять cv2 headers. Проверки в Tasks 4–5.
4. **Поздний DOM lifecycle:** listeners стартуют раньше view, marker/graphics читаются после render; повторный start не сбрасывает состояние. Проверки в Tasks 2 и 4.
5. **Header bounds:** Unicode locale/timezone, malformed dimensions и чрезмерные значения не должны раздувать snapshot или ломать base64url. Проверки в Tasks 2–3.
6. **Идентичность snapshot/score:** graphics/engagement меняют properties, но не score при фиксированных core inputs. Проверка в Tasks 2–3.

---

### Task 1: Нормативный `pa1` Core и Golden Fixtures

**Files:**
- Create: `contracts/product-analytics-v1.md`
- Create: `tests/fixtures/product-analytics-v1.json`
- Create: `packages/product-analytics/package.json`
- Create: `packages/product-analytics/tsconfig.json`
- Create: `packages/product-analytics/src/page-frame.ts`
- Create: `packages/product-analytics/src/page-codec.ts`
- Create: `packages/product-analytics/src/page-conversion.ts`
- Create: `packages/product-analytics/tests/page-frame.test.ts`
- Create: `packages/product-analytics/tests/page-codec.test.ts`
- Create: `packages/product-analytics/tests/page-conversion.test.ts`
- Modify: `scripts/check-contract.mjs`

**Interfaces:**
- Produces:
```typescript
export interface PageContext {
  actionPath: string;
  selectedView: string;
  viewId: string;
  eventId: string;
  timestamp: number;
}

export interface PageResult {
  profile: 'pa1';
  pulse: string;
  score: string;
  eventId: string;
}

export function calculatePageResult(context: PageContext): PageResult;
export function encodePageTime(timestamp: number): [number, number];
export function decodePageTime(parts: [number, number]): number;
```

- [ ] **Step 1: Написать failing arithmetic/codec/pipeline tests**

Проверить add/mul/rotate на границах `0xffffffff`; encode/decode timestamp 0, 1, `0xffffffff`, `0x100000000` и fixture values; строгие 32 hex IDs; pathname по правилам cv2; selectedView 1–256 UTF-8 bytes.

Fixtures содержат минимум четыре cases: valid login, valid register, missing marker и duplicate marker. Для каждого сохранить page/view/event/time frames, pulse, score, eventId и decoded timestamp.

- [ ] **Step 2: Запустить tests и подтвердить отсутствие реализации/fixtures**

Run:
```bash
npm test --workspace @company/product-analytics
node scripts/check-contract.mjs
```
Expected: FAIL из-за отсутствующих package/core и pa1 fixture validation.

- [ ] **Step 3: Зафиксировать алгоритм и создать независимые fixtures**

Использовать:

```text
INITIAL     = [6a09e667, bb67ae85, 3c6ef372, a54ff53a]
MULTIPLIERS = [9e3779b1, 85ebca6b, c2b2ae35, 27d4eb2f]
ADDITIVES   = [7f4a7c15, 6a09e667, bb67ae85, 3c6ef372]
PERMUTATION = [2, 0, 3, 1]

page: domain 35, rounds 2
view: domain 8e, rounds 3
event: domain 59, rounds 2
time: domain d4, rounds 3
```

`absorb` формирует `domain || u16le(payloadLength) || payload`. Для byte `b` с index `i`:

```text
lane = (i + domain) mod 4
s = b XOR domain XOR ((i × 29) mod 256)
m = mul32(add32(frame[lane], s OR ((i mod 256) << 8)), MULTIPLIERS[lane])
frame[lane] = rotl32(m, (i mod 15)+1) XOR
              add32(frame[(lane+1) mod 4], ADDITIVES[(lane+i) mod 4])
other = (lane+3) mod 4
frame[other] = add32(frame[other],
  rotl32(add32(s, i), ((lane×5+i) mod 15)+1))
```

Каждый diffuse round использует snapshot `old`:

```text
j = PERMUTATION[i]
mixed = mul32(old[j] XOR rotl32(old[(j+1) mod 4], ((round+i) mod 15)+1),
              MULTIPLIERS[(i+round) mod 4])
frame[i] = rotl32(add32(mixed, ADDITIVES[(i+round) mod 4]),
                  ((i×7+round×3) mod 15)+1) XOR old[(i+3) mod 4]
```

Event payload = 16 little-endian bytes viewId + 16 bytes eventId. Time payload = encoded out0/out1 + u64le timestamp. Score = четыре u32 little-endian в hex.

Time codec:

```text
K0=51f15eed, K1=9e3779b9, K2=6d2b79f5, C=7f4a7c15
a = low32(timestamp) XOR K0
b = high32(timestamp) XOR K1
x = add32(a, rotl32(b, 11))
y = b XOR rotl32(x, 7)
out0 = x XOR K2
out1 = add32(y, C)
```

Обратный порядок обязателен. Fixtures вычислить отдельным ignored BigInt reference, не production helpers.

- [ ] **Step 4: Реализовать core и bounded settle-проекции**

Реализовать arithmetic без BigInt в production: `Math.imul`, `>>>0`, явные rotations. После каждой stage выполнить короткие data-dependent projections, восстанавливающие исходный frame; проверить эквивалентность минимум на 10 000 generated frames. Не экспортировать core из будущего публичного `index.ts`.

- [ ] **Step 5: Запустить core, contract и существующие regression tests**

Run:
```bash
npm test --workspace @company/product-analytics
node scripts/check-contract.mjs
npm test --workspace @company/marketing-telemetry
```
Expected: PASS; cv1/cv2 fixtures и marketing tests не изменились.

- [ ] **Step 6: Commit**

```bash
git add contracts/product-analytics-v1.md tests/fixtures/product-analytics-v1.json packages/product-analytics scripts/check-contract.mjs
git commit -m "feat: define independent product analytics profile"
```

### Task 2: PageView IDs, Graphics, Engagement и Snapshot

**Files:**
- Create: `packages/product-analytics/src/page-view.ts`
- Create: `packages/product-analytics/src/graphics.ts`
- Create: `packages/product-analytics/src/engagement.ts`
- Create: `packages/product-analytics/src/snapshot.ts`
- Create: `packages/product-analytics/src/types.ts`
- Create: `packages/product-analytics/tests/page-view.test.ts`
- Create: `packages/product-analytics/tests/graphics.test.ts`
- Create: `packages/product-analytics/tests/engagement.test.ts`
- Create: `packages/product-analytics/tests/snapshot.test.ts`

**Interfaces:**
- Produces:
```typescript
export class PageViewSequence {
  constructor(initialWords: [number, number, number, number]);
  readonly viewId: string;
  nextEvent(): string;
}

export class EngagementState {
  start(target?: Document): void;
  snapshot(nowMilliseconds: number): [number, number, number, number];
}

export function readGraphics(canvas: HTMLCanvasElement | null): GraphicsState;
export function createAnalyticsSnapshot(input: SnapshotInput): AnalyticsSnapshot;
export function serializeSnapshot(snapshot: AnalyticsSnapshot): string;
```

- [ ] **Step 1: Написать failing ID/engagement tests**

Проверить little-endian IDs и carry; stable viewId/уникальные sequential eventIds. Пустое состояние `[0,0,0,age]`; focus/blur/visibility не меняют active/count; mousemove/keydown/touchstart/scroll меняют bits/count; buckets 0/1/2/3; повторный start не сбрасывает состояние и не дублирует listeners; age boundaries 1/5/15/60 секунд.

- [ ] **Step 2: Написать failing graphics/snapshot tests**

Проверить no canvas/no context = unavailable; context без extension или generic/masked renderer = unknown; SwiftShader/llvmpipe/softpipe = software; non-software renderer = standard; graphics не участвует в core score.

Snapshot: representative fixture, Unicode language/timezone limits, dimension/DPR/core/touch caps, все feature bits, deterministic compact JSON и base64 size <=1400.

- [ ] **Step 3: Запустить environment tests и подтвердить failure**

Run: `npm test --workspace @company/product-analytics`
Expected: FAIL на отсутствующих modules/ожидаемых states.

- [ ] **Step 4: Реализовать environment adapters**

IDs формируются без cryptographic API. `EngagementState.start()` устанавливает passive/capture listeners один раз и использует только capped counters/bitmask; raw events не сохраняются.

`readGraphics()` не бросает исключения наружу и не возвращает raw renderer. Snapshot безопасно работает при отсутствии DOM/screen/navigator и всегда сохраняет фиксированный порядок полей. Никаких score inputs из graphics/engagement.

- [ ] **Step 5: Запустить полный package suite**

Run: `npm test --workspace @company/product-analytics`
Expected: все core/environment tests PASS; representative raw/base64 sizes задокументированы выводом tests.

- [ ] **Step 6: Commit**

```bash
git add packages/product-analytics
git commit -m "feat: collect compact product analytics snapshots"
```

### Task 3: ProductAnalytics Facade и Пять Заголовков

**Files:**
- Create: `packages/product-analytics/src/settings.ts`
- Create: `packages/product-analytics/src/product-analytics.ts`
- Create: `packages/product-analytics/src/index.ts`
- Create: `packages/product-analytics/tests/product-analytics.test.ts`

**Interfaces:**
- Produces:
```typescript
export class ProductAnalytics {
  constructor();
  start(): void;
  getEngagementHeaders(actionPath: string): Promise<Record<string, string>>;
}
```

- [ ] **Step 1: Написать failing facade tests**

При fixed environment проверить точные pa1 golden headers, пять ключей без шестого noise header, properties base64url без padding, отсутствие plaintext timestamp и size budget. Два sequential вызова имеют разные eventId/score и общий viewId. Graphics/engagement изменения меняют только properties.

Проверить missing/duplicate DOM fallback и отсутствие browser globals без частичных результатов.

- [ ] **Step 2: Запустить facade tests и подтвердить failure**

Run: `npm test --workspace @company/product-analytics`
Expected: FAIL из-за отсутствующего facade.

- [ ] **Step 3: Реализовать facade и header mapping**

Facade один раз создаёт PageViewSequence, кеширует graphics на первый post-render вызов, получает Date.now один раз на запрос и формирует core result + snapshot. `start()` идемпотентен; `getEngagementHeaders()` вызывает его, но не обещает восстановление прошедших событий.

Base64url использовать UTF-8 через TextEncoder/btoa с Node test fallback только в тестовой среде, не второй runtime.

- [ ] **Step 4: Запустить package tests**

Run: `npm test --workspace @company/product-analytics`
Expected: все tests PASS; headers <=2 KB и properties <=1400 chars.

- [ ] **Step 5: Commit**

```bash
git add packages/product-analytics
git commit -m "feat: expose product analytics engagement headers"
```

### Task 4: Angular Providers, Interceptor и Demo

**Files:**
- Create: `packages/product-analytics/src/angular-interceptor.ts`
- Create: `packages/product-analytics/src/providers.ts`
- Create: `packages/product-analytics/tests/angular-interceptor.test.ts`
- Create: `packages/product-analytics/tests/providers.test.ts`
- Modify: `packages/product-analytics/src/index.ts`
- Modify: `apps/demo-web/package.json`
- Modify: `apps/demo-web/src/main.ts`
- Modify: `apps/demo-web/src/app/app.ts`
- Modify: `apps/demo-web/src/app/app.html`
- Modify: `apps/demo-web/src/environments/environment.ts`
- Modify: `apps/demo-web/src/environments/environment.development.ts`
- Modify: `apps/demo-web/src/environments/environment.staging.ts`
- Modify: `package-lock.json`

**Interfaces:**
- Produces `provideProductAnalytics(): Provider[]` и `productAnalyticsInterceptor: HttpInterceptorFn`; ранний `ENVIRONMENT_INITIALIZER` вызывает root `ProductAnalytics.start()`.

- [ ] **Step 1: Написать failing Angular tests**

Проверить пять headers на всех методах, final pathname, отсутствие retry, удаление только собственных stale headers после ошибки и сохранение шести cv2 headers. Provider test запускает start ровно один раз и не требует settings token.

- [ ] **Step 2: Запустить tests и подтвердить failure**

Run: `npm test --workspace @company/product-analytics`
Expected: FAIL на отсутствующих Angular exports/providers.

- [ ] **Step 3: Реализовать Angular integration и demo**

Регистрировать product interceptor перед marketing interceptor. В demo добавить `analyticsView` и ровно один hidden `canvas.analytics_stage`; существующий Wasm span не менять. Выполнить `npm install` для нового workspace и обновить lockfile.

- [ ] **Step 4: Запустить workspace tests и production build**

Run:
```bash
npm test
npm run build
```
Expected: все workspace tests PASS; demo собирается с обоими пакетами и Zone.js.

- [ ] **Step 5: Commit**

```bash
git add package-lock.json apps/demo-web packages/product-analytics
git commit -m "feat: integrate product analytics with Angular demo"
```

### Task 5: Release Package и Browser/Consumer Checks

**Files:**
- Create: `packages/product-analytics/scripts/build.mjs`
- Create: `packages/product-analytics/scripts/release.mjs`
- Create: `packages/product-analytics/scripts/artifact-rules.mjs`
- Create: `packages/product-analytics/tests/release.test.ts`
- Modify: `packages/product-analytics/package.json`
- Modify: `package.json`
- Modify: `scripts/check-browser.mjs`
- Modify: `scripts/check-package-angular.mjs`
- Modify: `packages/marketing-telemetry/tests/angular-interceptor.test.ts`

**Interfaces:**
- Produces `release/company-product-analytics-0.1.0.tgz`; root `build`/`build:npm` обрабатывают оба пакета; consumer script заменяет обе workspace dependencies на фактические archives.

- [ ] **Step 1: Написать failing release/browser assertions**

Release test проверяет minified ES2020 dist/declarations, отсутствие src/maps/docs, banned terms, representative pa1 golden headers и size budget. Scanner игнорирует длинные base64 literals.

Browser test в обычном режиме проверяет все 11 headers и pa1 fixtures. В `PRODUCT_ONLY=1` mode отключает WebAssembly до page load: cv2 headers отсутствуют, pa1 headers остаются валидными, feature Wasm bit=0, requests всё ещё отправляются без runtime exceptions.

- [ ] **Step 2: Запустить release/browser tests и подтвердить failure**

Run:
```bash
npm run test:release --workspace @company/product-analytics
npm run build
npm run test:browser
PRODUCT_ONLY=1 npm run test:browser
```
Expected: FAIL до реализации release/browser обновлений; не менять cv2 expected values.

- [ ] **Step 3: Реализовать сборку, scanner и оба browser modes**

Product build не создаёт lazy chunk и не выполняет network requests. Browser fixtures фиксируют Date/performance/Math.random для обоих пакетов без production test hooks. Consumer test устанавливает оба `.tgz` и проверяет embedded/lazy Wasm в сочетании с одним TypeScript пакетом.

- [ ] **Step 4: Запустить полный release verification**

Run:
```bash
npm test
npm run build
npm run test:browser
PRODUCT_ONLY=1 npm run test:browser
npm run build:npm
npm run test:release --workspace @company/product-analytics
npm run test:release --workspace @company/marketing-telemetry
npm run test:package:angular
```
Expected: все команды exit 0; product-only сохраняет pa1 и теряет только cv2 headers; оба consumer variants PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json packages scripts
git commit -m "test: verify both analytics packages in browsers"
```

### Task 6: Документация, Отложенный Processor и Полная Проверка

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/deployment.md`
- Modify: `docs/frontend-guide.md`
- Modify: `docs/php-developer-guide.md`
- Modify: `docs/php-mirror-pseudocode.md`
- Modify: `docs/post-implementation-ideas.md`
- Create: `docs/modules/product-analytics.md`
- Modify: `docs/modules/angular-demo.md`
- Modify: `docs/superpowers/specs/2026-11-19-product-analytics-design.md`

**Interfaces:**
- Фиксирует реализованный frontend `pa1` и сохраняет Internal Feature Processor как будущую работу без утверждения о backend enforcement.

- [ ] **Step 1: Обновить документацию на русском**

Описать 11 headers, canvas marker, ранний start, pa1 contract/fixtures, snapshot fields/budget, graphics states, engagement semantics, CORS, Angular 16 install обоих `.tgz`, browser product-only mode и ограничения клиентской подделки/replay.

В `post-implementation-ideas.md` перенести/связать skeleton Internal Feature Processor: async ingestion, projections, environmentKey без UA/IP, агрегаты, TTL, observation-only и NAT/VDI caveats. Не выбирать Go/queue/storage.

- [ ] **Step 2: Проверить актуальность документов и generated artifacts**

Run:
```bash
git diff --check
npm test
npm run build
npm run test:browser
PRODUCT_ONLY=1 npm run test:browser
npm run build:npm
npm run test:package:angular
cargo test --manifest-path crates/funnel-wasm/Cargo.toml
```
Expected: все PASS; docs не утверждают наличие PHP/Go/replay enforcement; размеры и versions совпадают с reports.

- [ ] **Step 3: Зафиксировать фактический baseline**

Добавить размер product `.tgz`/dist и representative header sizes в deployment doc; производительность указать только по фактическому observation без жёсткого порога.

- [ ] **Step 4: Commit**

```bash
git add README.md docs
git commit -m "docs: describe product analytics and deferred processing"
```
