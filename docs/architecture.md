# Архитектура и поток выполнения

## 1. Ответственность компонентов

| Компонент | Ответственность | Подробное описание |
|---|---|---|
| Angular `App` | Хранит состояние demo и инициирует login/register | [`modules/angular-demo.md`](modules/angular-demo.md) |
| `ConversionDemoService` | Отправляет login/register JSON через `HttpClient` | [`modules/angular-demo.md`](modules/angular-demo.md) |
| `marketingTelemetryInterceptor` | Извлекает pathname, получает свежие заголовки и клонирует каждый `HttpClient`-запрос | [`modules/telemetry-package.md`](modules/telemetry-package.md) |
| `TelemetrySdk` | Проверка ответа WASM и формирование заголовков | [`modules/telemetry-package.md`](modules/telemetry-package.md) |
| `RuntimeGate` | Однократная инициализация и разделение concurrent-вызовов | [`modules/telemetry-package.md`](modules/telemetry-package.md) |
| `pixel-runtime.ts` | Base64 decode и инициализация WebAssembly из bytes | [`modules/telemetry-package.md`](modules/telemetry-package.md) |
| Rust `funnel-wasm` | Время, DOM, канонизация свойств, clickId и вычисления `cv2` | [`modules/rust-wasm.md`](modules/rust-wasm.md) |
| HTTP API | Получает JSON и telemetry-заголовки | Backend mirror пока отложен |

## 2. Полный путь login/register

```text
Пользователь нажимает кнопку
        │
        ▼
ConversionDemoService.submit(...)
  • отправляет JSON через Angular HttpClient
  • не выбирает специальные login/register telemetry-свойства
        │
        ▼
marketingTelemetryInterceptor
  • извлекает только pathname из URL
  • запрашивает свежие заголовки у root TelemetrySdk
        │
        ▼
RuntimeGate
  • при первом вызове запускает loadPixelRuntime()
  • concurrent-вызовы получают один Promise инициализации
        │
        ▼
pixel-runtime.ts
  • декодирует PIXEL_BASE64 и передаёт bytes в wasm-bindgen
        │
        ▼
Rust calculate_funnel_score(journey, "[]", scorePrefix)
  • получает точный Unix timestamp текущей секунды
  • читает span.telemetrics_click[data-tag]
  • формирует начальный clickId без cryptographic API
  • выполняет journey → touchpoint → properties один раз
  • перебирает click → pulse до совпадения scorePrefix
        │
        ▼
TelemetrySdk проверяет JSON и возвращает шесть заголовков
        │
        ▼
Interceptor клонирует request и один раз передаёт его downstream
  • ошибка генерации → исходный request без telemetry-заголовков
  • HTTP-ошибка downstream → передаётся приложению без retry
```

## 3. Что возвращает npm-пакет

`TelemetrySdk.getConversionHeaders()` возвращает `Promise<Record<string, string>>` с шестью заголовками:

| Заголовок | Содержимое |
|---|---|
| `X-GA-Measurement-Id` | Версия профиля активного runtime, сейчас `cv2` |
| `X-GA-Session-Id` | `pulse` — обратимое представление Unix timestamp в секундах |
| `X-Amplitude-Device-Id` | `score` — 64 строчных hex-символа с настроенным `scorePrefix` |
| `X-Amplitude-Event-Id` | Финальный `clickId` — 32 строчных hex-символа |
| `X-Amplitude-Session-Properties` | Канонический JSON свойств в base64url без padding |
| `X-YM-Counter-Client` | Статическое telemetry-значение |

Названия централизованы в `packages/marketing-telemetry/src/settings.ts`.

## 4. Данные, которые получает Rust

### `journey`

Строка API-пути, например `/api/auth/login`. Она участвует в вычислении и должна совпадать с проверкой backend.

### `propertiesJson`

JSON-массив пар `[name, value]`, а не JSON-объект. TypeScript использует `Object.entries()` и поэтому сохраняет порядок вставки свойств. Rust дополнительно применяет правила канонизации контракта.

### Текущее время

TypeScript не передаёт timestamp как аргумент. Rust сам получает `js_sys::Date::now()` и использует `floor(now / 1000)`. Timestamp фиксируется на время перебора. `clickId` меняет результат между вызовами, но без будущего server-side single-use учёта не запрещает повторное использование валидного набора в пределах серверного допуска.

### `clickId` и `scorePrefix`

Начальный 128-битный `clickId` формируется из `Math.random()`, времени, `performance.now()` и счётчика вызовов без cryptographic API. По умолчанию `scorePrefix = "00"`: в среднем требуется 256 попыток. Поддерживаются `""`, `"0"`, `"00"` и `"000"`. Начальный префикс выбран как лёгкий режим; фактическая задержка зависит от устройства.

### DOM

Rust ищет `span.telemetrics_click` и читает `data-tag`. Missing/empty/duplicate/oversized состояния обрабатываются правилами fallback, а не должны считаться нормальной интеграцией.

Fallback позволяет браузеру завершить вычисление, но не означает принятие запроса. В демонстрационной конфигурации будущий PHP обязан ожидать реальный настроенный `data-tag` и отклонять результат, вычисленный с `telemetry.unresolved.v1`; **fallback нельзя назначать ожидаемым серверным marker** ради прохождения таких запросов.

## 5. Embedded и lazy

Алгоритм и API одинаковые. Меняется только расположение минифицированного runtime в npm-архиве.

### Embedded

```text
dist/index.js = facade + runtime + wasm-bindgen glue + base64-WASM
```

- нет отдельного runtime-запроса;
- пакет смешивается с общим Angular bundle;
- стартовый bundle больше.

### Lazy

```text
dist/index.js           = facade + loader
dist/pixel.<hash>.js    = runtime + glue + base64-WASM
```

- до первого API-вызова вычислительный chunk не нужен;
- при первом вызове загружается один JS chunk;
- повторные и concurrent-вызовы используют один `RuntimeGate`;
- Angular может переименовать файл в `chunk.<hash>.js`.

Оба варианта создаются командой `npm run build:npm`; размеры записываются в `release/size-report.json`.

## 6. Сборка против выполнения

### На машине сборки

```text
Rust → wasm-pack → pixel.wasm → generated-pixel.ts → esbuild → .tgz
```

Rust, `wasm-pack`, generated `pkg/` и TypeScript-исходники нужны здесь.

### У frontend-команды

```text
npm install выбранного .tgz → обычный Angular build
```

Rust и отдельная настройка WASM не нужны. Пакет уже минифицирован, comments/source maps отсутствуют.

### В браузере

```text
JS bundle → base64 decode → WebAssembly.instantiate → вычисления
```

Отдельный `.wasm` в Network не загружается.

## 7. Границы доверия и безопасности

- Browser, DOM, JS, base64 и WASM находятся на стороне клиента и могут быть исследованы или изменены.
- Маскировка убирает очевидные подсказки и увеличивает стоимость анализа, но не доказывает подлинность браузера.
- Нельзя считать клиентский `score` самостоятельным доказательством безопасности.
- Независимая серверная реализация должна проверять входные данные, время и результат по тому же контракту.
- PHP mirror и endpoints сейчас не реализованы; demo browser server намеренно возвращает generic `403`, чтобы проверить сетевые заголовки без backend.

Нормативные детали: [`../contracts/conversion-v1.md`](../contracts/conversion-v1.md). Псевдокод будущей серверной части: [`php-mirror-pseudocode.md`](php-mirror-pseudocode.md).
