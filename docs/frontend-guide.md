# Фронтенд: структура проекта и сборка

> Перенос предсобранного WASM, создание локального npm-архива, подключение пакета к другому Angular-проекту и production-деплой описаны в [`deployment.md`](deployment.md).
>
> Назначение классов, методов и Rust-модулей для дальнейших доработок: [`php-developer-guide.md`](php-developer-guide.md).

## 1. Быстрый старт

Все команды выполняются из корня репозитория под Node.js 18; demo и пакет проверяются на Angular 16.2 / TypeScript 5.1:

```bash
npm install       # Только если зависимости ещё не установлены.
npm run build     # Wasm → base64 → minified embedded NPM dist → Angular production.
npm run build:npm # Дополнительно: embedded + lazy .tgz и size-report.json.
npm test          # Контракт, TypeScript, оба NPM-варианта и реальный Wasm.
npm run test:browser
PRODUCT_ONLY=1 npm run test:browser
```

Для повторной сборки после изменения Rust достаточно:

```bash
npm run build
```

Новые версии `pixel.wasm`, base64-строки и Angular bundle будут созданы автоматически.

## 2. Карта каталогов

```text
hash-security/
├── apps/
│   └── demo-web/                         # Angular 16 demo + Zone.js
│       ├── angular.json                  # production/staging/development сборки
│       ├── package.json                  # ng build, ng serve и frontend unit tests
│       ├── proxy.conf.json               # Будущий /api proxy на PHP
│       ├── src/
│       │   ├── main.ts                   # Bootstrap, HttpClient и telemetry interceptor
│       │   ├── index.html
│       │   ├── app/
│       │   │   ├── app.ts                # Компонент страницы и HttpClient
│       │   │   ├── app.html              # Inputs, кнопки и DOM-якорь
│       │   │   ├── app.css
│       │   │   └── conversion-demo.service.ts # HTTP-запросы без ручной telemetry
│       │   └── environments/             # data-tag для каждой конфигурации
│       └── tests/                        # Тесты сервиса отправки
│
├── packages/
│   └── marketing-telemetry/              # Локальный NPM workspace
│       ├── src/
│       │   ├── index.ts                  # Публичные TelemetrySdk и interceptor
│       │   ├── angular-interceptor.ts    # Pathname, fail-open и headers HttpClient
│       │   ├── conversion.ts             # Заголовки и разбор ответа Wasm
│       │   ├── runtime.ts                # Base64 decode и lazy initialization
│       │   ├── settings.ts               # Имена заголовков
│       │   ├── types.ts                  # TypeScript-контракты
│       │   └── generated-pixel.ts        # GENERATED: Wasm в base64
│       ├── pkg/                          # GENERATED: wasm-bindgen output
│       ├── dist/                         # GENERATED: скомпилированный NPM JS
│       └── tests/
│
│   # Независимый TypeScript product analytics без Wasm
│   └── product-analytics/
│       ├── src/page-frame.ts             # Четыре u32 и стадии pa1
│       ├── src/page-codec.ts             # Время, IDs и byte limits
│       ├── src/page-conversion.ts        # Независимый pa1 pipeline
│       ├── src/page-view.ts              # viewId/eventId sequence
│       ├── src/engagement.ts             # Capped counters/bitmask
│       ├── src/graphics.ts               # Обобщённая graphics category
│       ├── src/snapshot.ts               # Compact analytics JSON
│       ├── src/product-analytics.ts      # Facade и три headers
│       ├── src/providers.ts              # Ранний Angular start
│       └── src/angular-interceptor.ts    # Независимый pa1 interceptor
│
├── crates/
│   └── funnel-wasm/                      # Rust crate
│       ├── Cargo.toml                    # Зависимости и release-профиль
│       ├── src/
│       │   ├── lib.rs                    # calculate_funnel_score и Date::now()
│       │   ├── click.rs                  # ClickId, prefix и browser seed
│       │   ├── sampling.rs               # Повторное использование prefix frame
│       │   ├── journey.rs                # API-путь и контекст вычисления
│       │   ├── touchpoint.rs             # DOM и fallback
│       │   ├── pulse.rs                  # Обратимый Unix timestamp
│       │   ├── frame.rs                  # Восемь u32 и hex-сериализация
│       │   ├── stages.rs                 # Реальные стадии и дополнительные ветки
│       │   ├── codec.rs                  # Канонические свойства
│       │   └── tables.rs                 # Константы преобразований
│       └── tests/                        # Rust fixture/property tests
│
├── contracts/
│   ├── conversion-v1.md                  # Сохранённый исходный алгоритм
│   ├── conversion-v2.md                  # Активный алгоритм с clickId
│   └── product-analytics-v1.md           # Независимый TypeScript pa1
├── tests/
│   └── fixtures/conversion-v*.json       # Независимые ожидаемые значения
├── scripts/
│   ├── build-wasm.mjs                    # Сборка Wasm и base64 TypeScript
│   ├── check-browser.mjs                 # Production browser/CDP tests
│   └── check-contract.mjs                # Проверка fixture-структуры
└── package.json                          # Корневые команды и NPM workspaces
```

`server/` и PHP runtime сейчас отсутствуют. Отложенная серверная реализация описана в `docs/php-mirror-pseudocode.md`.

## 3. Что является исходником, а что артефактом

### Редактировать вручную

- `crates/funnel-wasm/src/**`
- `packages/marketing-telemetry/src/*.ts`, кроме `generated-pixel.ts`
- `apps/demo-web/src/**`
- `contracts/conversion-v1.md`, `contracts/conversion-v2.md` и `contracts/product-analytics-v1.md`
- тесты и fixtures при изменении протокола.

### Не редактировать вручную

- `packages/marketing-telemetry/pkg/**` — создаёт `wasm-pack`/`wasm-bindgen`.
- `packages/marketing-telemetry/src/generated-pixel.ts` — создаёт `scripts/build-wasm.mjs`.
- `packages/marketing-telemetry/dist/**` — declarations создаёт TypeScript, минимизированный JS — esbuild.
- `release/**` — создаёт release-скрипт: два `.tgz`, staging и size report.
- `apps/demo-web/dist/**` — создаёт Angular.
- `Cargo.lock`, `package-lock.json` — изменяются менеджерами зависимостей, но коммитятся.

Generated-каталоги исключены из Git. Поэтому правильный порядок сборки обязателен.

## 4. Как собрать только Wasm-модуль

```bash
npm run build:wasm
```

Скрипт `scripts/build-wasm.mjs` выполняет:

1. Находит `wasm-pack` сначала в `.tools/cargo/bin`, затем в системном `PATH`.
2. Запускает release-сборку `crates/funnel-wasm` с target `web`.
3. Создаёт JS glue и TypeScript declarations в `packages/marketing-telemetry/pkg`.
4. Переименовывает бинарный артефакт в:

```text
packages/marketing-telemetry/pkg/pixel.wasm
```

5. Читает байты `pixel.wasm`, кодирует их стандартным base64 и создаёт:

```text
packages/marketing-telemetry/src/generated-pixel.ts
```

Пример генерируемого модуля:

```typescript
export const PIXEL_BASE64 = 'AGFzbQEAAAAB...';
```

Сырой `pixel.wasm` остаётся доступен для низкоуровневых тестов и анализа, но **Angular его не запрашивает и не копирует в public assets**. В `npm pack` включается только минимизированный `dist`: JS glue и base64 объединяются в JS, raw `.wasm` и generated `pkg/` в архив не входят. Тесты `package-contents.test.ts` и `release.test.ts` проверяют содержимое архивов.

### Точка входа Rust

Браузерный экспорт находится в `crates/funnel-wasm/src/lib.rs`:

```rust
calculate_funnel_score(journey, properties_json, score_prefix)
```

Он самостоятельно:

- получает время через `js_sys::Date::now()`;
- вычисляет точный Unix timestamp текущей секунды;
- ищет `span.telemetrics_click` и читает `data-tag`;
- подставляет fallback при missing/empty/duplicate DOM;
- формирует начальный `clickId` без cryptographic API;
- выполняет `sample_v2()` с настроенным `scorePrefix`;
- возвращает JSON с `profile`, `clickId`, `pulse`, `score` и `properties`.

## 5. Как собрать NPM-пакет

После сборки Wasm:

```bash
npm run build --workspace @company/marketing-telemetry
```

TypeScript создаёт declarations, а esbuild объединяет и минифицирует пакет в `packages/marketing-telemetry/dist`. Это embedded-сборка по умолчанию.

Для обоих распространяемых архивов:

```bash
npm run build:npm
```

- `embedded` помещает runtime и base64 в `dist/index.js`;
- `lazy` выносит их в `dist/pixel.<hash>.js`, который загружается при первом API-вызове;
- `release/size-report.json` показывает raw/base64/JS/gzip-размеры;
- `company-product-analytics-0.1.0.tgz` содержит независимый минифицированный TypeScript `pa1`, а `product-analytics-size-report.json` фиксирует его размер.

Во время выполнения:

1. `runtime.ts` загружает `pixel-runtime.ts` только при первом обращении.
2. `pixel-runtime.ts` декодирует `PIXEL_BASE64` через `atob` в `Uint8Array`.
3. Байты передаются в `wasm-bindgen` как `module_or_path`.
4. Получается `PixelRuntime` без `fetch` для Wasm.

Angular регистрирует `marketingTelemetryInterceptor` через `provideHttpClient(withInterceptors(...))`. Root `InjectionToken` создаёт `TelemetrySdk`, поэтому обычным сервисам ручной вызов пакета не нужен. Angular/RxJS подключаются как peer dependencies.

Параметр `pixelUrl` больше не нужен и удалён из API.

## 6. Как собрать Angular

Production:

```bash
npm run build --workspace demo-web -- --configuration=production
```

Development:

```bash
npm run build --workspace demo-web -- --configuration=development
```

Staging:

```bash
npm run build --workspace demo-web -- --configuration=staging
```

Результат production-сборки:

```text
apps/demo-web/dist/demo-web/browser/
```

Environments содержат `touchpoint`, `analyticsView` и два публичных project ID: `telemetryMeasurementId` и `analyticsMeasurementId`. Каждый environment задаёт собственные значения. `pixelUrl` отсутствует: WASM встроен в JS.

## 7. Почему корневая команда именно такая

`npm run build` намеренно выполняет последовательность:

```text
1. npm run build:wasm
2. npm run build --workspace @company/marketing-telemetry
3. npm run build --workspace @company/product-analytics
4. npm run build --workspace demo-web
```

Так Angular никогда не импортирует устаревший или отсутствующий `dist` локального NPM-пакета.

## 8. Запуск development-сервера

```bash
npm run start --workspace demo-web
```

По умолчанию используется development-конфигурация. `proxy.conf.json` уже содержит будущий `/api` proxy на `127.0.0.1:8080`, но PHP endpoints пока не реализованы.

## 9. Проверки

### Контракт и TypeScript

```bash
npm test
```

Проверяются fixtures, TypeScript-фасад, lazy initialization, повтор после ошибки, сервис отправки и настоящий Wasm из embedded base64. В integration-тесте сетевой `fetch` намеренно запрещён.

### Rust

Если Rust установлен в системном `PATH`:

```bash
cargo test --manifest-path crates/funnel-wasm/Cargo.toml
```

При использовании существующего project-local toolchain:

```bash
export CARGO_HOME="$PWD/.tools/cargo"
export RUSTUP_HOME="$PWD/.tools/rustup"
export PATH="$PWD/.tools/cargo/bin:$PATH"
cargo test --manifest-path crates/funnel-wasm/Cargo.toml
```

### Реальный браузер

```bash
npm run test:browser
```

Проверяются:

- production Angular и настоящий embedded Wasm;
- точные `clickId`, `pulse` и `score` из cv2 golden fixtures;
- точные pa1 score/eventId/pulse и analytics snapshot из отдельных fixtures;
- `PRODUCT_ONLY=1` сохраняет pa1 при отключённом WebAssembly;
- отсутствие сетевого запроса `pixel.wasm`;
- valid/missing/empty/duplicate DOM;
- login/register и свойства всех пяти запросов;
- generic `403` без Runtime-исключений.

В WSL поддерживаются уже установленные Windows Node.js 22+ и Chrome. Явный Linux `CHROME_BIN` имеет приоритет. `BROWSER_CHECK_NO_WINDOWS=1` отключает Windows-делегирование.

## 10. Base64: что это даёт и чего не даёт

- Отдельный `.wasm` HTTP-запрос устранён.
- NPM-пакет становится самодостаточным для Angular bundler.
- Base64 — это **кодирование, а не шифрование и не защита от анализа**. Байты легко восстанавливаются из JS bundle.
- Размер закодированного значения примерно на 33% больше исходного Wasm.
- Сборка всё равно содержит Wasm-инструкции; маскировка реализуется архитектурой и вычислениями, а не самим base64.

## 11. Типичные проблемы

### `Cannot find module './generated-pixel.js'`

Сначала выполните:

```bash
npm run build:wasm
```

### `pixel.wasm` отсутствует в `pkg`

Его создаёт `scripts/build-wasm.mjs`, а не TypeScript или Angular. Выполните `npm run build:wasm`.

### Angular импортирует старый NPM-код

Выполните полную корневую сборку `npm run build`, а не только `ng build`.

### Отдельный `pixel.wasm` снова появился в public assets

Это не требуется текущей архитектуре. Шаг копирования удалён; проверьте, что в `angular.json` не возвращён старый `assets`-mapping и что используется актуальный `runtime.ts`.
