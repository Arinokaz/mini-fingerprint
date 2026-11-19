# Дизайн `pa1`: TypeScript product analytics и отложенная обработка признаков

> Статус: frontend-пакет, Angular 16 demo, release и browser checks реализованы. Backend mirror, политика решений и Internal Feature Processor остаются отложенными.

## 1. Назначение

Добавить второй независимый npm-пакет, который внешне является лёгкой product analytics интеграцией. Пакет формирует собственный проверяемый conversion key и небольшой analytics snapshot среды/вовлечения.

Wasm `@company/marketing-telemetry` остаётся маркетинговой telemetry-системой с активным `cv2`. Новый TypeScript-пакет не повторяет его алгоритм и не является fallback-копией.

Серверная обработка разделяется на два этапа:

1. Синхронная проверка TypeScript conversion key основным backend.
2. Асинхронная обработка analytics envelope отложенным Internal Feature Processor.

Текущая работа ограничивается frontend-пакетом, demo, fixtures и документацией. Backend и Internal Feature Processor не реализуются.

## 2. Цели

- Независимый TypeScript npm-пакет `@company/product-analytics`.
- Пять analytics-заголовков, включая один компактный properties header.
- Собственный лёгкий детерминированный алгоритм `pa1` с четырьмя `u32` lanes и 128-битным результатом.
- Обязательный DOM marker, независимый от Wasm marker.
- Проверяемые timestamp, eventId, viewId и итоговый score.
- Компактный snapshot screen/device/locale/runtime/graphics/engagement без сырых событий.
- Пассивный сбор вовлечения без потока отдельных сетевых событий.
- Graphics category без передачи полного GPU renderer.
- Angular 16.2, TypeScript 5.1, Node.js 18.17+, ES2020.
- Русские TSDoc, комментарии и документация.
- Минифицированный npm-артефакт без source maps, исходников и раскрывающих публичных терминов.

## 3. Не входит в текущую работу

- PHP mirror и endpoints.
- Redis, replay-cache, IP-баны и риск-политика.
- Go или иной Internal Feature Processor.
- Очередь и долговременное хранилище.
- Изменение Wasm `cv2`.
- Canvas fingerprint или чтение/хеширование пикселей.
- Сырые GPU vendor/renderer в HTTP.
- Mouse trajectories, координаты, клавиши и содержимое полей.
- `navigator.webdriver`, `Event.isTrusted`, Permissions API и старые headless checks.
- Дополнительный challenge API.
- Привязка к HTTP body.

## 4. Рассмотренные подходы

### 4.1. Полный TypeScript mirror Wasm

Отклонён владельцем: упростил бы анализ основного алгоритма и нарушил независимость каналов.

### 4.2. Только сбор analytics без самостоятельного conversion key

Недостаточен: backend не получил бы обязательного проверяемого frontend-результата. Любой HTTP-клиент мог бы отправлять произвольные analytics properties.

### 4.3. Независимый лёгкий key + асинхронный analytics envelope — выбран

Основной backend может сразу проверить обязательный TypeScript-канал, а более дорогая статистика не задерживает запрос. `eventId` связывает оба потока. Analytics values не включаются в score, поэтому сложная JSON-канонизация для проверки ключа не требуется.

### 4.4. Тяжёлый перебор в обоих пакетах

Отклонён: увеличил бы задержку всех запросов и расход батареи. TypeScript остаётся лёгким; его TypeScript-only сценарий компенсируется последующей серверной аналитикой.

## 5. Компоненты

```text
apps/demo-web
  ├── существующий span.telemetrics_click для Wasm
  └── один canvas.analytics_stage[data-view] для TypeScript

packages/product-analytics
  ├── engagement collection
  ├── graphics category
  ├── analytics snapshot
  ├── независимый pa1 core
  ├── TypeScript facade
  ├── Angular interceptor/providers
  └── unit/integration/release tests

Будущий основной backend
  ├── синхронно проверяет pa1
  ├── проверяет формат/размер envelope
  └── асинхронно передаёт envelope во внутренний сервис

Отложенный Internal Feature Processor
  ├── нормализует значения
  ├── строит projections/environment keys
  └── агрегирует повторяемость по IP/сессиям
```

## 6. Публичный TypeScript API

### 6.1. Facade

```typescript
export class ProductAnalytics {
  constructor();

  start(): void;

  getEngagementHeaders(
    actionPath: string,
  ): Promise<Record<string, string>>;
}
```

`start()` идемпотентно устанавливает engagement listeners. Он должен вызываться при bootstrap, чтобы не потерять события до первого API-запроса. `getEngagementHeaders()` также вызывает `start()` на случай ручной интеграции, но поздний старт не восстанавливает уже прошедшие события.

Метод не принимает timestamp, DOM marker, graphics или engagement от вызывающего кода. Он сам получает текущий environment snapshot.

### 6.2. Angular

```typescript
provideProductAnalytics()
productAnalyticsInterceptor
```

`provideProductAnalytics()` не принимает параметров и регистрирует root facade и ранний initializer для `start()`. Отдельный `ProductAnalyticsSettings` и settings token в первой версии отсутствуют: единственная прикладная конфигурация — environment markers. Это исключает пустой публичный API, который можно было бы ошибочно считать поддерживаемой настройкой.

В demo оба interceptor регистрируются совместно:

```typescript
provideHttpClient(withInterceptors([
  productAnalyticsInterceptor,
  marketingTelemetryInterceptor,
]))
```

Оба interceptor независимы. Ошибка одного не удаляет заголовки другого. Оба должны находиться после interceptor'ов, изменяющих API URL.

При ошибке TypeScript-генерации запрос продолжается без пяти заголовков `pa1`; будущий backend обязан отклонять отсутствие обязательного TypeScript-набора согласно своей политике.

## 7. DOM integration

В корневой шаблон добавляется ровно один дополнительный элемент:

```html
<canvas
  class="analytics_stage"
  [attr.data-view]="analyticsView"
  hidden
></canvas>
```

`analyticsView` берётся из environment и имеет отдельные development/staging/production значения.

TypeScript принимает marker только при наличии ровно одного `.analytics_stage`, непустого `data-view` длиной не более 256 UTF-8 bytes. Missing/empty/duplicate/oversized дают:

```text
analytics.unresolved.v1
```

Будущий backend использует собственный ожидаемый marker и не должен принимать fallback как нормальный configured marker.

Canvas одновременно служит DOM marker и необязательным источником graphics context. Видимого UI он не создаёт.

## 8. HTTP profile `pa1`

Передаются пять заголовков:

| Заголовок | Значение |
|---|---|
| `X-PA-Measurement-Id` | `pa1` |
| `X-PA-Session-Id` | Обратимо закодированный timestamp, 16 lowercase hex |
| `X-PA-Device-Id` | Независимый 128-битный score, 32 lowercase hex |
| `X-PA-Event-Id` | Финальный eventId, 32 lowercase hex |
| `X-PA-Session-Properties` | Compact analytics JSON в base64url без padding |

Отдельный static noise header не добавляется. Screen/device/locale/graphics/engagement не получают отдельных HTTP-заголовков.

## 9. Идентификаторы

### 9.1. `viewId`

128-битный идентификатор page view, сохраняется в analytics snapshot и остаётся неизменным в пределах одного root facade/page lifecycle.

### 9.2. `eventId`

128-битный идентификатор конкретного API-запроса. Участвует в score и передаётся отдельным заголовком. Тот же eventId должен быть доступен backend для связи с envelope; внутри snapshot дублировать его не требуется, поскольку backend объединяет оба значения из одного набора headers.

Начальные идентификаторы формируются из `Math.random()`, Date/performance и счётчика без cryptographic API. Это analytics IDs, а не секреты. Последующие события используют детерминированный increment/view sequence.

## 10. Лёгкий алгоритм `pa1`

### 10.1. Отличия от Wasm

- Четыре `u32` lanes вместо восьми.
- 128-битный score вместо 256 бит.
- Собственные constants, domains, rotations и diffuse rules.
- Другой порядок поглощения route/marker/event/time.
- Собственное обратимое кодирование времени.
- Нет `scorePrefix` и нет перебора.
- Analytics snapshot не участвует в score.

### 10.2. Входы

```text
API pathname
ожидаемый data-view marker либо fallback
viewId
eventId
точный Unix timestamp текущей секунды
```

### 10.3. Конвейер

```text
frame = PA_INITIAL
frame = page(frame, utf8(actionPath))
frame = view(frame, utf8(selectedView))
frame = event(frame, viewIdBytes || eventIdBytes)
frame = time(frame, encodedTimeBytes || timestampBytes)
score = четыре little-endian u32 в lowercase hex
```

Точные формулы, constants, domains и rounds фиксируются в отдельном `contracts/product-analytics-v1.md` и независимых fixtures. Все операции должны быть воспроизводимы будущим PHP без float-зависимости.

Дополнительные bounded runtime-directed вычисления могут быть встроены в настоящие стадии, но должны иметь ограниченную стоимость и проверяться на эквивалентность. Они не образуют отдельного публичного `hash`/`security`/`proof` модуля.

## 11. Analytics snapshot

### 11.1. Формат

Compact JSON object с фиксированным порядком полей для стабильных fixtures:

```json
{
  "v": 1,
  "viewId": "32 lowercase hex",
  "screen": "1920x1080",
  "viewport": "1280x720",
  "dpr": 100,
  "cores": 8,
  "touch": 0,
  "lang": "ru-RU",
  "tz": "Europe/Moscow",
  "gfx": 1,
  "features": 173,
  "engagement": [1, 2, 11, 2]
}
```

Snapshot передаётся полностью на каждый запрос. Delta-state для первой версии не используется.

### 11.2. Display

- `screen`: physical screen dimensions либо `unavailable`.
- `viewport`: inner dimensions либо `unavailable`.
- Размеры ограничиваются документированным диапазоном.
- `dpr`: целое число процентов, например 100 = 1, 200 = 2; значение огрубляется и ограничивается.

### 11.3. Device/locale

- `cores`: capped/bucketed hardware concurrency; 0 = unknown.
- `touch`: capped maxTouchPoints.
- `lang`: primary language, короткая строка.
- `tz`: timezone name либо `unknown`; длина ограничена.

### 11.4. Graphics

```text
0 = unknown
1 = standard/hardware-like
2 = software-like
3 = unavailable
```

Graphics определяется один раз на view и кешируется. Если renderer masked или недостаточен для классификации, используется `unknown`, а не `standard`. Полные vendor/renderer наружу не передаются.

Отсутствие WebGL не влияет на валидность pa1 score.

### 11.5. Feature bitmask

```text
bit 0 — WebAssembly
bit 1 — WebGL
bit 2 — Canvas 2D
bit 3 — storage available
bit 4 — cookies enabled
bit 5 — PDF viewer
bit 6 — UserActivation API
bit 7 — touch support
```

Отсутствие optional API является нормальным значением, а не ошибкой генерации.

### 11.6. Engagement

Массив ровно из четырёх чисел:

```text
[active, countBucket, categoryMask, ageBucket]
```

- `active`: 0/1; становится 1 после первого qualifying input события с момента первого `start()` и не сбрасывается между запросами текущего view.
- `countBucket`: 0 = none, 1 = one, 2 = 2–5, 3 = 6+; учитывает только qualifying input события.
- `categoryMask`: pointer/keyboard/touch/scroll/focus/visibility bits.
- `ageBucket`: возраст текущего view от первого `start()` до snapshot: 0 <1s, 1 <5s, 2 <15s, 3 <60s, 4 = 60+. Это не время последнего события; отдельного значения «never» не требуется.

Qualifying input события для `active` и `countBucket`:

```text
mousemove
keydown
touchstart
scroll
```

`focus`, `blur` и `visibilitychange` только выставляют соответствующие category bits. Они не делают `active=1` и не увеличивают countBucket, поэтому программный focus сам по себе не выглядит как вовлечение. Повторный `start()` не сбрасывает counters, categoryMask или начало view.

Listeners только увеличивают capped counters/bitmask. Они не отправляют события, не хранят координаты/клавиши и не читают содержимое полей. Время последнего события не сохраняется.

## 12. Размеры

Целевой бюджет:

```text
raw snapshot <= 1024 bytes
base64url properties <= 1400 bytes
все пять pa1 headers вместе <= 2 KB
```

Обычный snapshot ожидается существенно меньше этих пределов. В package tests фиксируется фактический размер representative snapshot.

User-Agent и IP не включаются: они уже доступны backend. Полные GPU strings, список шрифтов, raw events и содержимое полей запрещены.

## 13. Сборка и маскировка

- Пакет публикуется как минифицированный browser ESM с declarations.
- Target ES2020; comments/source maps отсутствуют.
- Angular/RxJS остаются peer dependencies.
- Отдельного Wasm/lazy chunk нет.
- Публичные названия ограничиваются analytics-лексикой: profile, session, view, event, device, engagement, features, graphics, properties, score.
- В JS/declarations запрещены `risk`, `bot`, `human`, `token`, `secret`, `signature`, `security`, `authentication`, `authorization`, `nonce`, `challenge`, `proofOfWork`, `mining`, `headless` и `getRandomValues`.
- Маскировка не отменяет честного внутреннего описания ограничений: алгоритм доступен клиенту и не доказывает наличие человека.

## 14. Будущая backend-интерпретация

Предварительная матрица, которая не реализуется в текущей работе:

| TypeScript pa1 | Wasm cv2 | Предварительное решение |
|---|---|---|
| Валиден | Валиден | Обычная обработка; engagement не меняет решение |
| Валиден | Отсутствует | Базовая пометка; последующая аналитика может менять коэффициент |
| Валиден | Невалиден | Отклонение и отдельное нарушение |
| Отсутствует/невалиден | Любой | Отклонение |

Analytics values отправляются всеми клиентами одинаково. Их специальная интерпретация начинается только при TypeScript-only и только после накопления наблюдений.

Наличие активности не должно полностью очищать пометку. Повторяющееся отсутствие активности при массовых запросах может повышать коэффициент после отдельной настройки.

## 15. Отложенный Internal Feature Processor

Это раздел-скелет будущей работы, а не текущая реализация.

### 15.1. Поток

```text
API backend
  → проверяет pa1
  → добавляет доверенные server timestamp/IP/session context
  → публикует envelope во внутренний сервис
  → не ждёт результата аналитики для текущего запроса
```

Транспорт, Go, очередь и storage выбираются позже.

### 15.2. Нормализованные projections

```text
displayKey     = screen + DPR + orientation
deviceKey      = cores + touch + pointer/device capabilities
localeKey      = language + timezone
runtimeKey     = features + graphics + storage/cookie state
environmentKey = стабильная комбинация projections без IP и User-Agent
```

Viewport сравнивается отдельно из-за естественной изменчивости окна. User-Agent намеренно не входит в environmentKey, чтобы обнаруживать смену UA при сохранении остальной среды.

### 15.3. Агрегаты

Для environmentKey:

```text
request count
distinct IP/session/account/UA counts
TypeScript-only ratio
graphics/engagement distributions
first seen / last seen
```

Для IP и сессии:

```text
environment diversity
UA diversity
request rate
TypeScript-only ratio
```

Попарное сравнение каждого IP с каждым не требуется; основа — группировка по projections и несколько частичных ключей для поиска близких сред.

### 15.4. Ограничения решений

Одинаковое разрешение само по себе почти не имеет веса. Учитываются распространённость набора, число IP, временное окно, graphics, TypeScript-only, поведение и последовательность операций.

Нужны оговорки для NAT/CGNAT, VDI, учебных классов и одинаковых управляемых устройств. Процессор сначала observation-only и не должен самостоятельно блокировать клиентов.

### 15.5. Хранение

- Сырые IP/session observations имеют ограниченный TTL.
- Долгосрочно предпочтительны агрегаты.
- Нет Canvas hashes, полных GPU strings, шрифтов и raw behavior streams.
- Юридическая допустимость и политика хранения рассматриваются отдельно перед backend rollout.

## 16. Тестирование

### 16.1. Pure core

- Независимые pa1 fixtures для каждого промежуточного frame.
- Timestamp round-trip и границы.
- Перенос eventId/view sequence.
- Одинаковые входы дают одинаковый score.
- Изменение pathname/marker/viewId/eventId/timestamp меняет результат.
- Эквивалентность дополнительных bounded-ветвлений.
- Нет неограниченных циклов.

### 16.2. Environment

- Missing/empty/duplicate/oversized canvas marker.
- WebGL1/WebGL2/no context/no extension/masked/software renderer.
- Graphics вычисляется один раз на view.
- Любые graphics states не меняют pa1 score при прочих равных входах.
- Полный snapshot остаётся в size budget.
- Capped counters и passive listeners; нет raw event payloads.

### 16.3. Facade/Angular

- Ровно пять заголовков.
- Строгая форма profile/pulse/score/eventId/properties.
- Независимая ошибка и cleanup только собственных headers.
- Ранний start через Angular initializer.
- Совместная работа с marketingTelemetryInterceptor.
- Конфигурация environment markers.

### 16.4. Browser/release

- Angular 16 production с реальными обоими пакетами.
- Полный набор из 11 заголовков: шесть Wasm + пять TypeScript.
- TypeScript-only browser scenario путём отключения Wasm.
- Отсутствие отдельных analytics network requests.
- Нет `.wasm` requests, как и ранее.
- Реальный canvas graphics state и generic demo 403.
- `.tgz` содержит только dist и проходит neutral artifact scanner.
- Isolated Angular 16 consumer устанавливает оба пакета.

## 17. Документация

Все новые и изменяемые материалы ведутся на русском:

- нормативный `pa1` contract;
- fixtures и архитектура;
- frontend/deployment guides;
- карта классов и методов;
- Angular integration и два DOM marker;
- размеры/CORS;
- ограничения replay и клиентской подделки;
- отложенный Internal Feature Processor;
- русские TSDoc и неочевидные inline-комментарии.

Исторические design/plan-документы не переписываются.
