# Сборка, локальное подключение и деплой

Документ описывает, как из исходников или уже собранного WASM подготовить пакет `@company/marketing-telemetry`, подключить его к другому Angular-приложению и передать результат в production. Назначение классов и методов для доработок отдельно описано во внутреннем [`php-developer-guide.md`](php-developer-guide.md); эта документация не включается в npm-архивы.

Пакет является браузерным ESM-пакетом. Angular получает обычные JavaScript и TypeScript declarations, а WASM хранится внутри JS в виде base64. Поэтому после сборки пакета:

- Rust и `wasm-pack` на компьютере Angular-разработчика не нужны;
- отдельный файл `.wasm` не нужно копировать в `public`/`assets`;
- отдельный HTTP-запрос за `.wasm` и настройка MIME-типа `application/wasm` не требуются;
- Node.js нужен для npm и сборки Angular, но не для работы уже собранного статического сайта на сервере.

> Base64 — это способ встроить байты WASM в JS, а не шифрование. Он не скрывает алгоритм и не заменяет серверную проверку.

## 1. Выберите сценарий

| Что у вас есть | Что нужно установить | Что делать |
|---|---|---|
| Полный репозиторий, Rust не установлен | Node.js/npm, Rust stable, target `wasm32-unknown-unknown`, `wasm-pack` | [Полная сборка из Rust](#3-полная-сборка-из-rust) |
| Полный репозиторий и готовые `pkg/` + `generated-pixel.ts` | Только Node.js/npm | [Сборка пакета из готовых WASM-артефактов](#4-сборка-пакета-без-rust) |
| Полный репозиторий и только результаты прежнего `wasm-pack` | Только Node.js/npm, если сохранился JS glue | [Восстановление `generated-pixel.ts`](#43-если-есть-pixelwasm-но-нет-generated-pixelts) |
| Готовый архив `company-marketing-telemetry-0.1.0-embedded.tgz` | Только окружение вашего Angular-проекта | [Установка в Angular](#6-подключение-к-любому-angular-проекту) |

Во всех командах ниже используются условные пути:

- `/path/to/mini-fingerprint` — корень этого репозитория;
- `/path/to/angular-app` — корень Angular-приложения, в которое устанавливается пакет;
- `/path/to/wasm-artifacts` — каталог, куда вы сохранили результаты предыдущей WASM-сборки.

Замените их на реальные пути. Не выполняйте команды с этими placeholder-значениями буквально.

## 2. Проверка окружения для полной сборки

Для сборки этого репозитория требуются:

- Node.js `^18.17.0` и npm;
- Rust stable, установленный через `rustup`;
- компиляционный target `wasm32-unknown-unknown`;
- `wasm-pack`, доступный в `PATH`.

Проверьте установку:

```bash
node --version
npm --version
rustc --version
rustup target list --installed
wasm-pack --version
```

В выводе `rustup target list --installed` должна быть строка `wasm32-unknown-unknown`.

### 2.1. Установка Rust и target

Если Rust ещё не установлен, установите `rustup` по инструкции с <https://rustup.rs/>. Для Linux/macOS обычно используется:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

Для Windows установите `rustup-init.exe` с того же сайта, после установки откройте новый терминал.

Затем выполните:

```bash
rustup default stable
rustup target add wasm32-unknown-unknown
```

Файл `rust-toolchain.toml` также объявляет stable и нужный target, но явная проверка выше помогает отделить проблемы окружения от проблем сборки.

### 2.2. Установка `wasm-pack`

```bash
cargo install wasm-pack --locked
wasm-pack --version
```

Если команда установилась, но не находится, добавьте каталог Cargo `bin` в `PATH` и откройте новый терминал. В Linux/macOS это обычно `$HOME/.cargo/bin`.

Скрипт проекта сначала ищет `wasm-pack` в `.tools/cargo/bin`, а затем в системном `PATH`. Для обычной установки ничего дополнительно настраивать не нужно.

## 3. Полная сборка из Rust

Все команды этого раздела выполняются из корня репозитория:

```bash
cd /path/to/mini-fingerprint
```

### 3.1. Установка JS-зависимостей

Для чистого checkout и CI используйте lockfile:

```bash
npm ci
```

Для локальной разработки также допустимо `npm install`.

### 3.2. Сборка WASM и встраивание в TypeScript

```bash
npm run build:wasm
```

Команда запускает `scripts/build-wasm.mjs`, который:

1. Выполняет `wasm-pack build crates/funnel-wasm --target web --release`.
2. Создаёт `packages/marketing-telemetry/pkg/` с JS glue и declarations.
3. Переименовывает `funnel_wasm_bg.wasm` в `pkg/pixel.wasm`.
4. Читает `pixel.wasm` и кодирует байты в base64.
5. Создаёт `packages/marketing-telemetry/src/generated-pixel.ts` с экспортом `PIXEL_BASE64`.

Ожидаемые результаты:

```text
packages/marketing-telemetry/
├── pkg/
│   ├── funnel_wasm.js
│   ├── funnel_wasm.d.ts
│   ├── funnel_wasm_bg.wasm.d.ts
│   ├── package.json
│   ├── .npmignore
│   └── pixel.wasm
└── src/
    └── generated-pixel.ts
```

`pkg/` и `generated-pixel.ts` не хранятся в Git: это generated-артефакты. Их нужно либо создать сборкой, либо заранее передать на машину сборки.

### 3.3. Сборка TypeScript npm-пакета

```bash
npm run build --workspace @company/marketing-telemetry
```

Сборщик пакета создаёт `packages/marketing-telemetry/dist/`:

- `dist/index.js` — минифицированный ESM entry с facade, runtime, wasm-bindgen glue и base64-WASM;
- `dist/index.d.ts` и остальные declarations — типы для TypeScript, не загружаемые браузером.

JavaScript минифицируется **до создания npm-архива**, поэтому его вид не зависит от настроек Angular optimization. Комментарии и source maps не создаются. Корневая команда `npm run build` дополнительно собирает Angular demo; она использует embedded-вариант по умолчанию.

## 4. Сборка пакета без Rust

Этот сценарий подходит, если WASM уже собран на другой машине или в предыдущем CI job. Rust, `rustup`, target и `wasm-pack` здесь не нужны, но нужны Node.js/npm и **совместимый комплект generated-файлов**.

### 4.1. Какие артефакты переносить

Рекомендуемый вариант — сохранить после `npm run build:wasm` оба результата целиком:

```text
packages/marketing-telemetry/pkg/                  # Каталог целиком
packages/marketing-telemetry/src/generated-pixel.ts
```

Скопируйте их в те же места целевого репозитория:

```bash
cd /path/to/mini-fingerprint
mkdir -p packages/marketing-telemetry/pkg
mkdir -p packages/marketing-telemetry/src
cp -a /path/to/wasm-artifacts/pkg/. packages/marketing-telemetry/pkg/
cp /path/to/wasm-artifacts/generated-pixel.ts packages/marketing-telemetry/src/generated-pixel.ts
```

На Windows можно скопировать те же файлы через Проводник или PowerShell `Copy-Item`; важно сохранить имена и структуру каталогов, включая скрытый `.npmignore`.

Проверьте обязательные файлы:

```bash
test -f packages/marketing-telemetry/pkg/funnel_wasm.js
test -f packages/marketing-telemetry/pkg/funnel_wasm.d.ts
test -f packages/marketing-telemetry/pkg/funnel_wasm_bg.wasm.d.ts
test -f packages/marketing-telemetry/src/generated-pixel.ts
```

Каждая команда должна завершиться без вывода и с нулевым кодом возврата.

> Не смешивайте `pkg/` и `generated-pixel.ts` от разных версий Rust-кода. JS glue, declarations и встроенные WASM-байты должны происходить из одной сборки.

### 4.2. Сборка npm-пакета из перенесённых файлов

Из корня `/path/to/mini-fingerprint`:

```bash
npm ci
npm run build:release --workspace @company/marketing-telemetry
```

**Не выполняйте** `npm run build:wasm`: эта команда заново компилирует Rust и поэтому требует `wasm-pack`. Release-сборка использует уже перенесённые `pkg/` и `generated-pixel.ts`, минифицирует оба варианта и создаёт архивы без повторной Rust-компиляции.

### 4.3. Если есть `pixel.wasm`, но нет `generated-pixel.ts`

Одного бинарного `pixel.wasm` недостаточно: пакету также нужны `funnel_wasm.js` и declarations, сгенерированные тем же `wasm-pack`-сборочным шагом. Получить совместимый JS glue из одного `.wasm` средствами этого репозитория нельзя.

Если совместимый `pkg/funnel_wasm.js` и declarations сохранились, а потерян только `generated-pixel.ts`, его можно восстановить без Rust:

1. Поместите бинарный файл в `packages/marketing-telemetry/pkg/pixel.wasm`.
2. Убедитесь, что `funnel_wasm.js`, `funnel_wasm.d.ts` и `funnel_wasm_bg.wasm.d.ts` взяты из той же сборки.
3. Выполните из корня репозитория:

```bash
node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';

const wasm = readFileSync('packages/marketing-telemetry/pkg/pixel.wasm');
const source = '/** AUTO-GENERATED from a prebuilt pixel.wasm; do not edit. */\n'
  + `export const PIXEL_BASE64: string = ${JSON.stringify(wasm.toString('base64'))};\n`;

writeFileSync('packages/marketing-telemetry/src/generated-pixel.ts', source);
NODE
```

После этого выполните шаг [4.2](#42-сборка-npm-пакета-из-перенесённых-файлов).

Если сохранился **только** `pixel.wasm` без JS glue, правильные варианты — найти остальные результаты исходной сборки или один раз повторить полную сборку на машине с Rust. В дальнейшем сохраняйте весь комплект из раздела 4.1.

## 5. Создание и проверка двух npm-архивов

Из корня `/path/to/mini-fingerprint` выполните полную сборку:

```bash
npm run build:npm
```

Команда сначала запускает `build:wasm`, затем минифицирует и упаковывает два независимых варианта. Если `pkg/` и `generated-pixel.ts` уже перенесены с другой машины, Rust не нужен — вместо полной команды используйте `npm run build:release --workspace @company/marketing-telemetry`, как показано в разделе 4.2.

Для версии `0.1.0` будут созданы:

```text
release/
├── company-marketing-telemetry-0.1.0-embedded.tgz
├── company-marketing-telemetry-0.1.0-lazy.tgz
├── size-report.json
└── staging/                         # Служебные файлы для проверок, не для установки
```

Оба архива содержат package name `@company/marketing-telemetry` и version `0.1.0`, но устанавливать нужно только один вариант.

### 5.1. Выбор варианта

| Вариант | Содержимое runtime | Поведение в Angular |
|---|---|---|
| `embedded` | Один минифицированный `dist/index.js` с base64-WASM | Смешивается с общим bundle; дополнительный runtime JS не запрашивается |
| `lazy` | Небольшой `dist/index.js` и `dist/pixel.<hash>.js` | Runtime загружается при первом `getConversionHeaders()`; повторные вызовы используют тот же runtime |

`embedded` — основной вариант, когда важнее максимально смешать библиотеку с остальной минификацией проекта. `lazy` уменьшает стартовый bundle, если размер WASM важнее дополнительного JS-запроса.

Angular может переименовать `pixel.<hash>.js` в собственный `chunk.<hash>.js`: это нормально. Отдельного `.wasm`-запроса нет в обоих вариантах.

### 5.2. Размер

Файл `release/size-report.json` содержит:

- `rawWasmBytes` — размер `pixel.wasm`;
- `base64Bytes` — размер base64-представления;
- `variants.embedded.files` и `variants.lazy.files` — размер каждого JS и его gzip-размер.

Base64 увеличивает бинарные данные примерно на треть. Сравнивайте фактические значения из отчёта после каждого изменения алгоритма.

Baseline текущей `cv2`-сборки: raw Wasm 87 267 байт, base64 116 356 байт; embedded `index.js` — 124 780 байт / 57 295 gzip, lazy facade — 2 472 байта / 1 235 gzip, lazy runtime — 121 983 байта / 55 771 gzip. Это размеры конкретной сборки, а не лимиты.

Release-проверка реального Wasm на Node.js 18 для default `"00"` зафиксировала за 201 вызов: median 0,204 ms и p95 0,819 ms. Это наблюдение на текущей машине, а не обещание для браузеров и слабых устройств. Не повышайте prefix без отдельного измерения median/p95 на целевых клиентах.

Независимый product analytics `.tgz` — 6 069 bytes, а `dist/index.js` — 9 560 bytes / 4 117 gzip. Representative snapshot — 206 raw bytes и 275 base64url chars; protocol budget — 1024 raw bytes, 1400 base64url chars и не более 2 KB для всех пят pa1 headers.

### 5.3. Проверка содержимого и поведения

```bash
npm run test:release --workspace @company/marketing-telemetry
```

Проверяются оба реальных `.tgz`, отсутствие исходников/docs/`.wasm`/`.map`/комментариев и чувствительных терминов, единственная base64-строка, размеры и совпадение golden-заголовков.

Посмотреть содержимое вручную:

```bash
tar -tzf /path/to/mini-fingerprint/release/company-marketing-telemetry-0.1.0-embedded.tgz
tar -tzf /path/to/mini-fingerprint/release/company-marketing-telemetry-0.1.0-lazy.tgz
```

В embedded-архиве runtime находится в `package/dist/index.js`. В lazy-архиве дополнительно есть ровно один `package/dist/pixel-<hash>.js`. Каталога `package/pkg/` и отдельного `pixel.wasm` нет: generated glue уже включён в минифицированный JS.

Проверка установки каждого архива в отдельный Angular demo, production build и реальный браузер:

```bash
npm run test:package:angular
```

Для неё нужен существующий Chromium/Chrome. Поле `"private": true` запрещает случайную публикацию в registry, но не мешает локальным `npm pack` и `npm install`.

## 6. Подключение к любому Angular-проекту

Пакет является Angular-only и использует `@angular/common`, `@angular/core` и `rxjs` через `peerDependencies`. Текущий baseline — Angular 16.2, TypeScript 5.1, Node.js 18 для сборки и ES2020 для пакета. Поддерживаются ESM bundler и browser WebAssembly; более новые Angular-версии не заявляются без отдельной consumer-проверки.

### 6.1. Вариант A: установка готового `.tgz` — рекомендуется

Выполните из корня Angular-приложения:

```bash
cd /path/to/angular-app
npm install /path/to/mini-fingerprint/release/company-marketing-telemetry-0.1.0-embedded.tgz
```

Для lazy-варианта вместо этого используйте:

```bash
npm install /path/to/mini-fingerprint/release/company-marketing-telemetry-0.1.0-lazy.tgz
```

В обоих случаях отдельно установите обязательный независимый TypeScript-пакет:

```bash
npm install /path/to/mini-fingerprint/release/company-product-analytics-0.1.0.tgz
```

Wasm-вариант выбирается по bundle-стратегии; product analytics не заменяет его и не копирует его алгоритм.

npm добавит пакет в `dependencies` и обновит `package-lock.json`. Импорт и вызовы `TelemetrySdk` одинаковые в обоих случаях.

Для команды и CI удобнее передавать архив как артефакт и использовать относительный путь, например:

```text
angular-app/
├── package.json
├── package-lock.json
└── vendor/
    ├── company-marketing-telemetry-0.1.0-embedded.tgz
    └── company-product-analytics-0.1.0.tgz
```

Тогда из корня Angular-приложения:

```bash
npm install ./vendor/company-marketing-telemetry-0.1.0-embedded.tgz
npm install ./vendor/company-product-analytics-0.1.0.tgz
```

В `package.json` появится зависимость вида:

```json
{
  "dependencies": {
    "@company/marketing-telemetry": "file:vendor/company-marketing-telemetry-0.1.0-embedded.tgz"
  }
}
```

Файл из `file:`-зависимости должен быть доступен на каждой машине до выполнения `npm install`/`npm ci`. Путь и сам `.tgz` нельзя исключать из передаваемого набора файлов.

### 6.2. Вариант B: установка локального каталога для разработки

Сначала обязательно соберите пакет, чтобы в каталоге существовали `dist/` и `pkg/`. Затем из корня Angular-приложения:

```bash
cd /path/to/angular-app
npm install /path/to/mini-fingerprint/packages/marketing-telemetry
```

Этот способ удобен для локальной разработки, но хуже воспроизводится: каталог без generated-файлов или `dist/` неработоспособен. После изменения пакета повторно выполните его минифицированную build-команду, затем перезапустите сборку Angular. Для передачи другому разработчику и CI предпочтителен `.tgz`.

Проверка установки в обоих вариантах:

```bash
npm ls @company/marketing-telemetry
```

### 6.3. Что не нужно менять в `angular.json`

Не добавляйте:

- `pixel.wasm` в `assets`;
- отдельный WASM loader/plugin;
- `allowedCommonJsDependencies` для этого пакета;
- путь к `.wasm` в `TelemetrySdk`.

Текущий runtime сам декодирует встроенный base64 и передаёт байты в `wasm-bindgen`.

## 7. Использование пакета в Angular

### 7.1. Добавьте DOM-элемент

Добавьте в корневой шаблон или в шаблон страницы авторизации ровно один элемент:

```html
<span
  class="telemetrics_click"
  [attr.data-tag]="touchpoint"
  hidden
></span>
```

Добавьте рядом ровно один независимый TypeScript marker:

```html
<canvas
  class="analytics_stage"
  [attr.data-view]="analyticsView"
  hidden
></canvas>
```

`analyticsView` берётся из отдельного environment-поля и не должен совпадать по смыслу с Wasm `touchpoint`. Canvas также предоставляет необязательный graphics context; отсутствие WebGL не мешает pa1.

```typescript
import { environment } from '../environments/environment';

protected readonly touchpoint = environment.touchpoint;
protected readonly analyticsView = environment.analyticsView;
```

`data-tag` должен быть непустым и совпадать со значением, которого ожидает серверная проверка текущей сборки. Элемент должен существовать в активном DOM **до вызова** `getConversionHeaders()`. Не размещайте несколько элементов `.telemetrics_click` одновременно: duplicate/missing/empty обрабатываются fallback-логикой, но такие состояния не должны быть нормальной интеграцией.

### 7.2. Подключите interceptor

В standalone Angular зарегистрируйте пакет в существующем `HttpClient`:

```typescript
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { marketingTelemetryInterceptor } from "@company/marketing-telemetry";
import { productAnalyticsInterceptor, provideProductAnalytics } from "@company/product-analytics";

providers: [
  provideProductAnalytics(),
  provideHttpClient(withInterceptors([
    productAnalyticsInterceptor,
    marketingTelemetryInterceptor,
  ])),
]
```

После этого обычный сервис использует только `HttpClient`:

**Порядок interceptor’ов:** Angular применяет functional interceptors к запросу в порядке регистрации. `marketingTelemetryInterceptor` рекомендуется указывать **последним**, после interceptor’ов, которые добавляют API prefix, заменяют origin или иначе переписывают URL:

```typescript
provideHttpClient(withInterceptors([
  apiUrlInterceptor,
  productAnalyticsInterceptor,
  marketingTelemetryInterceptor,
]))
```

Тогда WASM получает pathname окончательного запроса. Никакой зарегистрированный после telemetry interceptor не должен снова менять URL, иначе подписанный путь и фактический серверный маршрут разойдутся.

```typescript
return this.http.post("/api/auth/login", { email, password });
```

Interceptor обрабатывает все `HttpClient`-запросы, передаёт в WASM pathname и настроенный `scorePrefix` и вызывает `getConversionHeaders(path, {})` заново для каждого запроса. Шесть заголовков добавляются целиком. Специальные `form=login/register` больше не используются.

`productAnalyticsInterceptor` независимо добавляет пять `X-PA-*` заголовков, а `provideProductAnalytics()` запускает engagement listeners до первого API-запроса. При ошибке одного пакета удаляются только его собственные headers; другой набор сохраняется.

`@angular/common`, `@angular/core` и `rxjs` объявлены как `peerDependencies`: пакет использует копии этих библиотек из приложения и не встраивает второй Angular в bundle. Текущий manifest требует Angular `>=16 <17` и RxJS `^7.8.0`; production, browser и isolated `.tgz` сборки проверены на Angular 16.2 / TypeScript 5.1.

Пакет не выполняет retry. Если инициализация или вычисление WASM завершились ошибкой, interceptor один раз отправляет исходный запрос без telemetry-заголовков; backend определяет дальнейшую политику. HTTP-ошибка backend не перехватывается как ошибка генерации и не вызывает повторную отправку.

Прямые вызовы нативного `fetch` и XHR вне `HttpClient` interceptor не обрабатывает.

По умолчанию `scorePrefix = "00"`: Wasm в среднем выполняет 256 попыток до подходящего score. Допустимы `""`, `"0"`, `"00"` и `"000"`. В Angular настройка передаётся через providers:

```typescript
import { TELEMETRY_SETTINGS } from '@company/marketing-telemetry';

providers: [
  {
    provide: TELEMETRY_SETTINGS,
    useValue: { conversion: { scorePrefix: '00' } },
  },
]
```

При ручном создании используется `new TelemetrySdk({ conversion: { scorePrefix: '00' } })`. Backend должен применять собственную согласованную настройку, а не доверять клиентскому выбору.

### 7.3. Timestamp и ручной API

Для нестандартной интеграции остаётся доступен `TelemetrySdk.getConversionHeaders(actionPath, properties)`. Обычному Angular-приложению ручной вызов не нужен.

WASM сам получает `floor(Date.now() / 1000)` и фиксирует timestamp на время перебора. `pulse` кодирует точный timestamp, а `clickId` делает последовательности вызовов различимыми. Без server-side single-use учёта clickId валидный набор можно повторно использовать в допустимом интервале. Backend должен проверять возраст timestamp; рекомендуемые начальные допуски — 30 секунд в прошлое и 5 секунд в будущее.

### 7.4. Если API находится на другом origin

При cross-origin запросе CORS настраивается на API-сервере. Кроме `Content-Type`, сервер должен разрешить передаваемые пакетом заголовки:

```text
X-GA-Measurement-Id
X-GA-Session-Id
X-Amplitude-Device-Id
X-Amplitude-Event-Id
X-Amplitude-Session-Properties
X-YM-Counter-Client
X-PA-Measurement-Id
X-PA-Session-Id
X-PA-Device-Id
X-PA-Event-Id
X-PA-Session-Properties
```

Также настройте допустимый origin, метод и credentials согласно архитектуре вашего приложения. Для same-origin `/api/...` отдельная CORS-настройка не нужна.

## 8. CI/CD и production-деплой

### 8.1. Рекомендуемый конвейер

1. **Build job:** установить Node.js и Rust, выполнить `npm ci` и `npm run build:npm`.
2. **Сохранение артефакта:** передать выбранный `embedded` или `lazy` `.tgz` в job Angular-сборки. Сохранить `size-report.json`; дополнительно можно сохранить `pkg/` и `generated-pixel.ts`, чтобы следующие сборки могли обходиться без Rust.
3. **Angular job:** установить `.tgz` через `file:`-зависимость, выполнить `npm ci` и production-сборку Angular.
4. **Deploy job:** опубликовать статический результат Angular-сборки обычным способом проекта.

Команды build job:

```bash
cd /path/to/mini-fingerprint
npm ci
rustup target add wasm32-unknown-unknown
npm run build:npm
npm run test:release --workspace @company/marketing-telemetry
```

`wasm-pack` должен быть установлен заранее в образе runner или шагом `cargo install wasm-pack --locked`.

Команды Angular job после того, как архив помещён в `vendor/` и зафиксирована `file:`-зависимость:

```bash
cd /path/to/angular-app
npm ci
npm run build -- --configuration production
```

Если скрипт Angular `build` не пробрасывает аргументы в вашей версии проекта, используйте его стандартную production-команду, например `npx ng build --configuration production`.

### 8.2. Что поставлять на web-сервер

Поставляйте только результат production-сборки Angular, обычно содержимое каталога `dist/<project>/browser/`; точный путь определяется `angular.json` вашего приложения.

На production web-сервере не нужны:

- Rust, Cargo, `rustup`, `wasm-pack`;
- исходники `crates/funnel-wasm`;
- исходный npm-пакет или его `dist/` отдельно от Angular bundle;
- отдельный `pixel.wasm`.

WASM-байты попадут в один из JS-файлов Angular bundle. Настройки сервера для WASM MIME-типа не требуются.

### 8.3. Обновление версии пакета

После изменения Rust или TypeScript:

1. Увеличьте `version` в `packages/marketing-telemetry/package.json` согласно принятому versioning.
2. Повторите WASM/TypeScript-сборку и создайте новый `.tgz`.
3. Обновите архив в Angular-проекте и выполните `npm install <путь-к-новому-архиву>`.
4. Зафиксируйте изменения `package.json` и `package-lock.json` потребителя.
5. Повторите production-сборку Angular.

Не подменяйте содержимое архива без контроля версии/integrity: это усложняет воспроизводимость и диагностику несовместимых `pkg/` и base64.

## 9. Типичные ошибки

### `spawnSync wasm-pack ENOENT` или `wasm-pack: command not found`

`wasm-pack` не установлен или не находится в `PATH`. Установите его и проверьте `wasm-pack --version`. Если Rust специально не нужен на этой машине, используйте готовые артефакты из раздела 4 и не запускайте `build:wasm`.

### `can't find crate for 'std'` или ошибка target `wasm32-unknown-unknown`

Установите target:

```bash
rustup target add wasm32-unknown-unknown
```

Затем повторите `npm run build:wasm`.

### `Cannot find module './generated-pixel.js'` / отсутствует `src/generated-pixel.ts`

Выполните `npm run build:wasm`, скопируйте файл из заранее собранных артефактов или восстановите его по разделу 4.3. Сам TypeScript и Angular этот файл не создают.

### Отсутствует `pkg/funnel_wasm.js`

Перенесён неполный `pkg/`. Нужны JS glue и declarations из той же `wasm-pack`-сборки, что и `pixel.wasm`. Один `.wasm` эту проблему не решает.

### В `.tgz` нет `dist/index.js`

Создайте оба release-архива заново:

```bash
npm run build:npm
```

Если generated WASM-артефакты уже перенесены и Rust отсутствует, используйте `npm run build:release --workspace @company/marketing-telemetry`.

### В `.tgz` нет `pixel.wasm`

Это ожидаемое поведение, а не ошибка. В embedded-варианте base64-байты находятся в `dist/index.js`, а в lazy — в `dist/pixel.<hash>.js`.

### Angular сообщает, что не может найти `@company/marketing-telemetry`

Проверьте из корня Angular-приложения:

```bash
npm ls @company/marketing-telemetry
```

Убедитесь, что `npm install` выполнен именно в этом проекте, а `file:`-путь к архиву/каталогу доступен. После исправления повторите `npm install`.

### После обновления Angular использует старый код

Пересоберите npm-пакет, создайте новый `.tgz`, повторно установите его в Angular и перезапустите Angular build/dev server. Проверьте установленную версию через `npm ls`.

### Появляется сетевой `404` для `pixel.wasm`

Текущий пакет не должен запрашивать `pixel.wasm`. Проверьте, не остались ли в приложении старый runtime, собственный `initWasm()` или assets-mapping из предыдущей интеграции. Используйте только `TelemetrySdk` из установленного пакета.

### Заголовки формируются с DOM fallback

Проверьте, что в момент отправки существует ровно один `span.telemetrics_click`, у него непустой `data-tag`, а Angular уже отрисовал этот шаблон. Не вызывайте генерацию до появления элемента.

### Браузер блокирует запрос из-за CORS

Если API на другом origin, добавьте telemetry-заголовки из раздела 7.3 в `Access-Control-Allow-Headers` на сервере и проверьте правила origin/method/credentials. Изменения `angular.json` здесь не помогут.
