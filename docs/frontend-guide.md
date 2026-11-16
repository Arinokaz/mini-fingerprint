# Фронтенд: структура проекта и сборка

## 1. Быстрый старт

Все команды выполняются из корня репозитория:

```bash
npm install       # Только если зависимости ещё не установлены.
npm run build     # Wasm → base64 TypeScript → NPM dist → Angular production.
npm test          # Контракт, TypeScript и реальный Wasm.
npm run test:browser
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
│   └── demo-web/                         # Angular 21 demo
│       ├── angular.json                  # production/staging/development сборки
│       ├── package.json                  # ng build, ng serve и frontend unit tests
│       ├── proxy.conf.json               # Будущий /api proxy на PHP
│       ├── src/
│       │   ├── main.ts                   # bootstrapApplication
│       │   ├── index.html
│       │   ├── app/
│       │   │   ├── app.ts                # Компонент страницы и TelemetrySdk
│       │   │   ├── app.html              # Inputs, кнопки и DOM-якорь
│       │   │   ├── app.css
│       │   │   └── conversion-demo.service.ts
│       │   └── environments/             # data-tag для каждой конфигурации
│       └── tests/                        # Тесты сервиса отправки
│
├── packages/
│   └── marketing-telemetry/              # Локальный NPM workspace
│       ├── src/
│       │   ├── index.ts                  # Публичный экспорт TelemetrySdk
│       │   ├── conversion.ts             # Заголовки и разбор ответа Wasm
│       │   ├── runtime.ts                # Base64 decode и lazy initialization
│       │   ├── settings.ts               # Имена заголовков
│       │   ├── types.ts                  # TypeScript-контракты
│       │   └── generated-pixel.ts        # GENERATED: Wasm в base64
│       ├── pkg/                          # GENERATED: wasm-bindgen output
│       ├── dist/                         # GENERATED: скомпилированный NPM JS
│       └── tests/
│
├── crates/
│   └── funnel-wasm/                      # Rust crate
│       ├── Cargo.toml                    # Зависимости и release-профиль
│       ├── src/
│       │   ├── lib.rs                    # calculate_funnel_score и Date::now()
│       │   ├── journey.rs                # API-путь и контекст вычисления
│       │   ├── touchpoint.rs             # DOM и fallback
│       │   ├── pulse.rs                  # Окна и обратимое время
│       │   ├── frame.rs                  # Восемь u32 и hex-сериализация
│       │   ├── stages.rs                 # Реальные стадии и дополнительные ветки
│       │   ├── codec.rs                  # Канонические свойства
│       │   └── tables.rs                 # Константы преобразований
│       └── tests/                        # Rust fixture/property tests
│
├── contracts/
│   └── conversion-v1.md                  # Нормативный алгоритм cv1
├── tests/
│   └── fixtures/conversion-v1.json       # Независимые ожидаемые значения
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
- `contracts/conversion-v1.md`
- тесты и fixtures при изменении протокола.

### Не редактировать вручную

- `packages/marketing-telemetry/pkg/**` — создаёт `wasm-pack`/`wasm-bindgen`.
- `packages/marketing-telemetry/src/generated-pixel.ts` — создаёт `scripts/build-wasm.mjs`.
- `packages/marketing-telemetry/dist/**` — создаёт TypeScript.
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

Сырой `pixel.wasm` остаётся доступен для низкоуровневых тестов и анализа, но **Angular его не запрашивает и не копирует в public assets**.

### Точка входа Rust

Браузерный экспорт находится в `crates/funnel-wasm/src/lib.rs`:

```rust
calculate_funnel_score(journey, properties_json)
```

Он самостоятельно:

- получает время через `js_sys::Date::now()`;
- вычисляет временное окно;
- ищет `span.telemetrics_click` и читает `data-tag`;
- подставляет fallback при missing/empty/duplicate DOM;
- выполняет `stages_v1()`;
- возвращает JSON с `profile`, `pulse`, `score` и `properties`.

## 5. Как собрать NPM-пакет

После сборки Wasm:

```bash
npm run build --workspace @company/marketing-telemetry
```

TypeScript компилирует пакет в `packages/marketing-telemetry/dist`.

Во время выполнения `runtime.ts`:

1. Импортирует `PIXEL_BASE64`.
2. Декодирует строку через `atob` в `Uint8Array`.
3. Передаёт байты в `wasm-bindgen` как `module_or_path`.
4. Получает `PixelRuntime` без `fetch` для Wasm.

Angular использует только:

```typescript
const telemetry = new TelemetrySdk();
```

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

В environments остаётся только `touchpoint` — значение `data-tag` текущей сборки. `pixelUrl` удалён из всех конфигураций.

## 7. Почему корневая команда именно такая

`npm run build` намеренно выполняет последовательность:

```text
1. npm run build:wasm
2. npm run build --workspace @company/marketing-telemetry
3. npm run build --workspace demo-web
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
- точные `pulse` и `score` из golden fixtures;
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
