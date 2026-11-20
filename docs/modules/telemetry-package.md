# TypeScript npm-пакет `@company/marketing-telemetry`

Пакет находится в `packages/marketing-telemetry`. Это Angular-only browser ESM-пакет: он предоставляет `marketingTelemetryInterceptor` и `TelemetrySdk`, а Angular/RxJS используются как `peerDependencies` приложения.

## 1. Карта файлов

| Файл | Ответственность |
|---|---|
| `src/angular-interceptor.ts` | Root `InjectionToken`, pathname extraction и `HttpInterceptorFn` |
| `src/index.ts` | Публичная точка входа пакета |
| `src/conversion.ts` | `TelemetrySdk`, проверка ответа WASM, формирование заголовков |
| `src/runtime.ts` | Lazy-загрузка runtime и `RuntimeGate` |
| `src/pixel-runtime.ts` | Base64 decode и конкретная инициализация WASM |
| `src/types.ts` | TypeScript-контракты runtime и ответа |
| `src/settings.ts` | Названия заголовков и статическое telemetry-значение |
| `src/generated-pixel.ts` | **Generated:** base64-WASM, не редактировать вручную |
| `scripts/build.mjs` | Declarations + минифицированный embedded/lazy JS |
| `scripts/release.mjs` | Staging, два `.tgz`, size report |
| `scripts/artifact-rules.mjs` | Проверка comments/source maps/терминов |

## 2. Публичная точка входа `src/index.ts`

Наружу экспортируются `TelemetrySdk`, `marketingTelemetryInterceptor`, `TELEMETRY_SETTINGS`, `TelemetrySettings` и тип `RuntimeLoader`. Обычному приложению достаточно:

```typescript
provideHttpClient(withInterceptors([marketingTelemetryInterceptor]))
```

Interceptor обрабатывает каждый `HttpClient`-запрос без endpoint allowlist. Его следует регистрировать последним в `withInterceptors([...])`, после любых преобразований API URL: запрос проходит functional interceptors в порядке регистрации, а подпись должна использовать окончательный pathname. Последующие interceptor’ы не должны переписывать URL после вычисления заголовков. `new URL(request.url, DOCUMENT.baseURI).pathname` учитывает реальный `<base href>` и удаляет origin, query и fragment; `urlWithParams` в WASM не передаётся. Для каждого запроса вызывается `getConversionHeaders(path, {})`. Root `InjectionToken` создаёт один `TelemetrySdk`, поэтому `RuntimeGate` общий, а результаты вычислений не кэшируются.

Ошибка генерации превращается в исходный request без telemetry-заголовков. `catchError` находится до downstream `switchMap`, поэтому HTTP-ошибка backend не вызывает повторную отправку. Собственного retry в пакете нет.

## 3. `TelemetrySdk` — `src/conversion.ts`

### Назначение

Даёт приложению один метод для получения telemetry-заголовков и скрывает детали инициализации/вызова WASM.

### Создание

```typescript
const telemetry = new TelemetrySdk({
  conversion: { scorePrefix: '00' },
});
```

Конструктор принимает `settings: TelemetrySettings = {}` и необязательный `loader: RuntimeLoader = loadPixelRuntime`. `settings.measurementId` задаёт публичный project ID; отсутствующее или некорректное значение отклоняет generation до инициализации runtime. По умолчанию `scorePrefix = "00"`. Допустимы `""`, `"0"`, `"00"` и `"000"`; остальные значения отклоняются до инициализации runtime. Constructor создаёт `RuntimeGate`, но сам по себе WASM не инициализирует.

Параметр `loader` прежде всего нужен TypeScript-тестам. В Angular настройки передаются через provider `TELEMETRY_SETTINGS`; root `TELEMETRY_SDK` использует их при создании фасада.

### Метод `getConversionHeaders`

```typescript
async getConversionHeaders(
  actionPath: string,
  properties: Record<string, string> = {},
): Promise<Record<string, string>>
```

**Вход:**

- `actionPath` — API-путь, например `/api/auth/login`;
- `properties` — дополнительные строковые свойства; по умолчанию пустой объект.

**Результат:** Promise с тремя заголовками: project ID, pulse и base64url envelope, перечисленными в [`../architecture.md`](../architecture.md#3-что-возвращает-npm-пакет).

**Основная логика:**

1. `Object.entries(properties)` превращает объект в массив пар и сохраняет порядок вставки.
2. `this.runtime.acquire()` получает уже инициализированный runtime или запускает инициализацию.
3. `calculate_funnel_score(actionPath, JSON.stringify(inputPairs), this.scorePrefix)` вызывает Rust.
4. `readPayload()` разбирает и проверяет JSON-ответ.
5. Канонический JSON envelope собирается в порядке `client,eid,props,sum,v` из static client, clickId, properties, score и profile.
6. Envelope кодируется base64url; метод возвращает project ID, pulse и envelope.

**Side effects:** при первом вызове может загрузиться lazy chunk, декодируется WASM, Rust читает DOM и текущее время.

**Ошибки:** ошибки загрузки/инициализации и некорректный ответ runtime не превращаются в частичные заголовки; Promise отклоняется.

**Инварианты:** нельзя независимо менять названия заголовков, формат `properties`, ожидаемый `profile=cv2` или порядок вычислений. Для этого нужны синхронные изменения контракта, backend и тестов.

## 4. Внутренние функции `conversion.ts`

### `readPayload(raw: string): ConversionPayload`

Разбирает строку через `JSON.parse`, затем вызывает `isPayload`.

- Некорректный JSON → `Invalid runtime response: malformed JSON`.
- JSON неправильной формы → `Invalid runtime response: inconsistent fields`.

Функция не доверяет данным только потому, что они пришли из WASM: TypeScript проверяет границу перед созданием заголовков.

### `isPayload(candidate: unknown): candidate is ConversionPayload`

Type guard — функция, которая проверяет значение и уточняет его TypeScript-тип.

Требует:

- объект;
- `profile === 'cv2'`;
- `clickId` из 32 строчных hex-символов;
- `pulse` из 16 строчных hex-символов;
- `score` из 64 строчных hex-символов;
- массив `properties`, каждый элемент которого проходит `isProperty`.

### `isProperty(candidate: unknown)`

Проверяет кортеж ровно из двух строк `[name, value]`. Это структурная проверка ответа WASM; правила допустимых имён/значений определяются Rust и контрактом.

### `encodeBase64Url(value: string): string`

1. `TextEncoder` превращает UTF-8 строку в bytes.
2. Bytes преобразуются в binary string для `btoa`.
3. `+` заменяется на `-`, `/` на `_`.
4. Завершающие `=` удаляются.

Это base64url без padding, а не шифрование.

## 5. `src/runtime.ts`

### `loadPixelRuntime: RuntimeLoader`

Асинхронный loader без аргументов:

```typescript
const pixel = await import('./pixel-runtime.js');
return pixel.instantiatePixelRuntime();
```

Dynamic import — единая точка, которую сборщик превращает в:

- встроенный код для `embedded`;
- отдельный `pixel.<hash>.js` для `lazy`.

### Класс `RuntimeGate`

Внутренний координатор инициализации. Он не экспортируется из публичного `src/index.ts`.

#### Поле `pending?: Promise<PixelRuntime>`

Хранит текущий или завершённый Promise. Пока runtime не запрошен, поле отсутствует.

#### `constructor(loader: RuntimeLoader = loadPixelRuntime)`

Сохраняет loader. Позволяет тестам проверять логику без настоящего WASM.

#### `acquire(): Promise<PixelRuntime>`

- Если `pending` отсутствует, вызывает loader и сохраняет Promise.
- Все последующие/concurrent-вызовы получают тот же Promise.
- При rejection Promise очищается только если он всё ещё является текущей попыткой.
- Следующий вызов после ошибки может повторить загрузку.

Это предотвращает повторную инициализацию WASM и параллельную загрузку одного lazy chunk несколькими submit-вызовами.

## 6. `src/pixel-runtime.ts`

### `instantiatePixelRuntime(): Promise<PixelRuntime>`

Статически импортирует generated glue и `PIXEL_BASE64` внутри lazy/embedded вычислительного модуля.

**Логика:**

1. `decodeBase64(PIXEL_BASE64)` создаёт `Uint8Array`.
2. `initialize({ module_or_path: bytes })` инициализирует wasm-bindgen.
3. Возвращает объект с методом `calculate_funnel_score`.

Передача bytes важна: wasm-bindgen не получает URL и поэтому не выполняет `fetch` за `.wasm`.

### `decodeBase64(value: string): Uint8Array`

- `atob` декодирует ASCII base64 в binary string;
- функция выделяет `Uint8Array` той же длины;
- `charCodeAt` последовательно записывает байты.

## 7. Типы — `src/types.ts`

| Тип | Значение |
|---|---|
| `TelemetrySettings` | Публичный `measurementId` и настройка `conversion.scorePrefix` |
| `PixelRuntime` | Объект с `calculate_funnel_score(journey, propertiesJson, scorePrefix): string` |
| `RuntimeLoader` | `() => Promise<PixelRuntime>` |
| `ConversionProperty` | Кортеж `[name: string, value: string]` |
| `ConversionPayload` | Ответ Rust: `profile`, `clickId`, `pulse`, `score`, `properties` |

`ConversionPayload` описывает ожидаемую форму, а runtime-проверки в `conversion.ts` доказывают её фактически.

## 8. Настройки — `src/settings.ts`

Централизует три текущих названия заголовков, legacy names для fail-open cleanup, `DEFAULT_SCORE_PREFIX = "00"` и `COUNTER_CLIENT = 'v2.10.4-pixel'`. При переименовании заголовка нужно менять не только эту константу, но и серверную проверку, CORS allowlist и тесты.

## 9. Generated base64 — `src/generated-pixel.ts`

Создаётся `scripts/build-wasm.mjs` из `pkg/pixel.wasm`:

```typescript
export const PIXEL_BASE64: string = '...';
```

Явный `: string` важен: TypeScript declaration должен содержать только тип, а не дублировать весь base64-литерал в `.d.ts`.

Файл generated, не редактируется вручную. Его байты и `pkg/` должны происходить из одной WASM-сборки.

## 10. Build/release scripts

### `scripts/build.mjs`

Аргументы:

```text
--variant embedded|lazy
--out-dir <каталог внутри репозитория>
```

1. Очищает только указанный generated output.
2. Запускает TypeScript `--emitDeclarationOnly`.
3. Использует esbuild: browser ESM, ES2020, bundle, minify, no legal comments, no source maps. Angular и RxJS остаются external peer dependencies.
4. В lazy включает splitting и `chunkNames=pixel-[hash]`.
5. Проверяет JS/declarations через artifact rules.

Обычный `npm run build --workspace @company/marketing-telemetry` создаёт embedded `dist/` для workspace demo.

### `scripts/release.mjs`

1. Создаёт отдельные `release/staging/embedded` и `release/staging/lazy`.
2. Вызывает build script для каждого варианта.
3. Создаёт упрощённый package manifest без devDependencies/scripts.
4. Выполняет `npm pack` и добавляет variant suffix к имени архива.
5. Считает raw WASM/base64 и JS/gzip sizes в `release/size-report.json`.

Архивы не содержат одновременно оба варианта.

### `scripts/artifact-rules.mjs`

- `withoutEmbeddedPayload()` исключает длинные base64-литералы перед текстовым сканированием.
- `assertNeutralArtifact()` запрещает comments, `sourceMappingURL` и термины `security`, `protection`, `secret`, `token`, `attack`, `bot`, `signature`, `authentication`, `authorization`, `nonce`, `challenge`, `proofOfWork`, `mining`, `getRandomValues` без учёта регистра, включая вхождения в camelCase. Единственное узкое исключение — framework identifier `InjectionToken`; обычные имена `authToken` по-прежнему запрещены.

## 11. Связанные тесты

| Тест | Что доказывает |
|---|---|
| `tests/angular-interceptor.test.ts` | Все методы, pathname, полный набор headers, generation fail-open и отсутствие downstream retry |
| `tests/conversion.test.ts` | Аргументы, пустые свойства, concurrent initialization, отклонение malformed payload |
| `tests/runtime.test.ts` | Lazy start, shared Promise, retry после ошибки |
| `tests/pixel.integration.test.ts` | Реальный WASM, cv2 golden headers, последовательность clickId, отсутствие `fetch` |
| `tests/package-contents.test.ts` | Минимизированный embedded package contract |
| `tests/release.test.ts` | Два архива, единственный payload, scanner, sizes, одинаковые golden headers обоих вариантов |

При изменении логики нужно сохранять соответствующие проверки или осознанно обновлять их вместе с контрактом.
