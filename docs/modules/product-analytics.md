# TypeScript npm-пакет `@company/product-analytics`

Пакет находится в `packages/product-analytics`. Это независимая product analytics интеграция для Angular 16, а не TypeScript-копия Wasm. Пакет формирует лёгкий `pa1` score и компактный snapshot среды/вовлечения, не создавая дополнительных сетевых запросов.

Нормативный алгоритм: [`../../contracts/product-analytics-v1.md`](../../contracts/product-analytics-v1.md). Отложенная группировка признаков на внутреннем сервисе описана в [`../post-implementation-ideas.md`](../post-implementation-ideas.md).

## 1. Публичный API

```typescript
import {
  ProductAnalytics,
  productAnalyticsInterceptor,
  provideProductAnalytics,
} from '@company/product-analytics';
```

Обычное Angular-приложение регистрирует:

```typescript
providers: [
  provideProductAnalytics(),
  provideHttpClient(withInterceptors([
    productAnalyticsInterceptor,
    marketingTelemetryInterceptor,
  ])),
]
```

`provideProductAnalytics()` не принимает settings. Root facade создаётся через `PRODUCT_ANALYTICS`, а `ENVIRONMENT_INITIALIZER` заранее вызывает `start()` и устанавливает engagement listeners.

Ручной API:

```typescript
const analytics = new ProductAnalytics();
analytics.start();
const headers = await analytics.getEngagementHeaders('/api/auth/login');
```

`start()` идемпотентен. Поздний запуск не восстанавливает события, произошедшие до установки listeners.

## 2. Пять HTTP-заголовков

| Заголовок | Содержимое |
|---|---|
| `X-PA-Measurement-Id` | `pa1` |
| `X-PA-Session-Id` | Обратимо закодированный timestamp, 16 lowercase hex |
| `X-PA-Device-Id` | 128-битный score, 32 lowercase hex |
| `X-PA-Event-Id` | Event ID текущего запроса, 32 lowercase hex |
| `X-PA-Session-Properties` | Compact analytics JSON в base64url без padding |

Screen/device/locale/runtime/graphics/engagement находятся внутри одного properties header. Static noise header не используется.

## 3. DOM marker

В demo добавлен ровно один:

```html
<canvas
  class="analytics_stage"
  [attr.data-view]="analyticsView"
  hidden
></canvas>
```

Marker принимается только при одном элементе и непустом `data-view` до 256 UTF-8 bytes. Missing/empty/duplicate/oversized дают `analytics.unresolved.v1`. Будущий backend использует собственный configured marker и не должен принимать fallback.

Canvas также является источником graphics category. Это не создаёт видимого UI.

## 4. Независимый `pa1`

Входы:

```text
API pathname
selectedView
viewId
eventId
Unix timestamp текущей секунды
```

Четыре `u32` проходят стадии page → view → event → time. Результат — 32 lowercase hex. Алгоритм не использует `scorePrefix`, не выполняет перебор и не разделяет константы/порядок с Wasm `cv2`.

`viewId` стабилен в пределах view. `eventId` увеличивается с переносом между четырьмя little-endian words. Оба идентификатора формируются без cryptographic API и не являются секретами.

Analytics snapshot не участвует в score. Общий eventId связывает проверяемый результат и properties для последующей асинхронной обработки.

## 5. Analytics snapshot

Фиксированный порядок полей:

```json
{
  "v": 1,
  "viewId": "32 hex",
  "screen": "1920x1080",
  "viewport": "1280x720",
  "dpr": 100,
  "cores": 8,
  "touch": 0,
  "lang": "ru-RU",
  "tz": "Europe/Moscow",
  "gfx": 1,
  "features": 173,
  "engagement": [0, 0, 0, 0]
}
```

### Display/device/locale

- `screen` и `viewport`: ограниченные целочисленные размеры либо `unavailable`;
- `dpr`: целое число процентов с шагом 25;
- `cores`: 0/2/4/8/16 buckets;
- `touch`: capped maxTouchPoints;
- `lang` и `tz`: строки с UTF-8 byte limits.

User-Agent и IP не дублируются: они доступны backend.

### Graphics

```text
0 = unknown
1 = standard/hardware-like
2 = software-like
3 = unavailable
```

Полный renderer не возвращается из модуля и не отправляется на backend. Отсутствие debug extension или generic/masked renderer означает `unknown`. Отсутствие context — `unavailable`. Graphics вычисляется один раз на view и не влияет на score.

### Feature bitmask

```text
bit 0 — WebAssembly
bit 1 — WebGL
bit 2 — Canvas 2D
bit 3 — storage
bit 4 — cookies
bit 5 — PDF viewer
bit 6 — UserActivation
bit 7 — touch
```

Отсутствие optional API — нормальное значение, а не ошибка генерации.

### Engagement

```text
[active, countBucket, categoryMask, ageBucket]
```

- `active`: 1 после первого qualifying input и не сбрасывается внутри view;
- `countBucket`: 0 = none, 1 = one, 2 = 2–5, 3 = 6+;
- `categoryMask`: pointer/keyboard/touch/scroll/focus/visibility;
- `ageBucket`: возраст view от первого `start()` — 0 <1s, 1 <5s, 2 <15s, 3 <60s, 4 = 60+.

Только `mousemove`, `keydown`, `touchstart`, `scroll` меняют active/count. `focus`, `blur`, `visibilitychange` меняют только category bits. Время последнего события не хранится.

Listeners пассивны, не отправляют отдельных событий и не читают координаты, клавиши или содержимое полей.

## 6. Размеры

Ограничения:

```text
raw snapshot <= 1024 bytes
base64url properties <= 1400 chars
все пять headers <= 2 KB
```

Representative test snapshot занимает 206 raw bytes и 275 base64url chars. Минифицированный `dist/index.js` текущей сборки — 8970 bytes / 3931 gzip; сам `.tgz` — 5850 bytes. Это измеренный baseline, а не жёсткий лимит для каждой будущей версии.

## 7. Ошибки и совместная работа с Wasm

`productAnalyticsInterceptor` обрабатывает все `HttpClient`-запросы. При ошибке генерации удаляются только собственные пять `X-PA-*` headers; шесть заголовков `cv2` и unrelated headers сохраняются. Downstream HTTP-ошибка не вызывает retry.

При отключённом WebAssembly в browser-check:

- `pa1` headers продолжают формироваться;
- feature bit 0 равен 0;
- `cv2` headers отсутствуют после собственного fail-open interceptor;
- нет дополнительного analytics network request.

## 8. Сборка и тесты

```bash
npm run build --workspace @company/product-analytics
npm test --workspace @company/product-analytics
npm run build:release --workspace @company/product-analytics
npm run test:release --workspace @company/product-analytics
```

Build использует TypeScript declarations и минифицированный browser ESM ES2020. Source maps/comments/исходники в `.tgz` отсутствуют. `scripts/artifact-rules.mjs` отклоняет раскрывающие термины, игнорируя длинные base64 literals.

| Тест | Гарантия |
|---|---|
| `page-frame.test.ts` | 32-битная арифметика и 10 000 эквивалентных projections |
| `page-codec.test.ts` | Timestamp round-trip, IDs, pathname/marker limits |
| `page-conversion.test.ts` | Все промежуточные frames и golden scores |
| `page-view.test.ts` | Stable viewId, sequential eventId и browser seed |
| `engagement.test.ts` | Пустое состояние, buckets, listeners, повторный start |
| `graphics.test.ts` | Unknown/software/standard/unavailable без raw renderer |
| `snapshot.test.ts` | Compact JSON, Unicode/number limits, size budget |
| `product-analytics.test.ts` | Точные пять headers и последовательность DOM states |
| `angular-interceptor.test.ts` | Все методы, cleanup, сохранение cv2, отсутствие retry |
| `providers.test.ts` | Автоматический ранний Angular start |
| `release.test.ts` | `.tgz`, scanner, built golden headers |

## 9. Границы доверия

Клиент может исследовать алгоритм, изменить DOM и сформировать произвольный analytics snapshot. `pa1` не доказывает подлинность браузера или человека. Без будущего single-use хранилища валидный набор можно повторить в пределах TTL.

Internal Feature Processor, PHP mirror, replay-cache и решения по IP/сессии остаются отложенными. Пакет не содержит серверной риск-политики.
