# Angular demo

Демонстрационное приложение находится в `apps/demo-web` и использует Angular 16.2 с Zone.js. Оно проверяет реальную интеграцию Angular `HttpClient`, npm interceptor и Rust/WASM. Это не готовая форма авторизации и не backend.

## 1. Bootstrap — `src/main.ts`

```typescript
bootstrapApplication(App, {
  providers: [
    { provide: TELEMETRY_SETTINGS, useValue: { measurementId: environment.telemetryMeasurementId } },
    provideProductAnalytics({ measurementId: environment.analyticsMeasurementId }),
    provideHttpClient(withInterceptors([
      productAnalyticsInterceptor,
      marketingTelemetryInterceptor,
    ])),
  ],
});
```

Interceptor регистрируется один раз. Все запросы `HttpClient`, включая login/register, проходят через него без endpoint allowlist и специальных свойств формы. Нативный `fetch` в demo не используется.

Дополнительно `provideProductAnalytics(settings)` заранее запускает engagement listeners, а `productAnalyticsInterceptor` добавляет три `X-PA-*` заголовка до Wasm interceptor. Два набора по три заголовка не зависят друг от друга. Project IDs берутся из environment и не являются секретами.

## 2. Компонент `App` — `src/app/app.ts`

`App` хранит:

- `touchpoint` из текущего environment;
- `status` и `busy` как signals;
- `ConversionDemoService`, созданный с внедрённым `HttpClient`.

`App.submit()` блокирует повторный submit через `busy`, вызывает сервис и показывает generic результат. Ошибки generation/network не раскрываются шаблону; техническая информация остаётся в console разработчика. Credentials не сохраняются в состоянии компонента.

## 3. Сервис `ConversionDemoService`

Сигнатура:

```typescript
constructor(http: HttpClient)

async submit(
  journey: ApiJourney,
  email: string,
  password: string,
): Promise<SubmissionResult>
```

Сервис вызывает только:

```typescript
http.post(journey, { email, password }, { observe: 'response' })
```

Он не создаёт `TelemetrySdk`, не получает заголовки и не добавляет `form=login/register`. Это делает interceptor.

HTTP-ответ с ненулевым status превращается в generic «Сервер принял/отклонил запрос». Network error со status `0` остаётся observable для компонента. Сервис не читает тело ошибки в шаблон и не выполняет retry.

## 4. Interceptor и WASM

Для каждого запроса interceptor:

1. Извлекает pathname без origin/query/fragment.
2. Получает один root `TelemetrySdk` через `InjectionToken`.
3. Вызывает `getConversionHeaders(path, {})` заново.
4. При успехе удаляет current+legacy cv2 values и клонирует request с тремя текущими заголовками.
5. При ошибке генерации отправляет исходный request без telemetry-заголовков.
6. Передаёт downstream HTTP-ошибку приложению без повторной отправки.

Первый вызов лениво инициализирует WASM. Runtime общий, а заголовки не кэшируются.

## 5. Шаблон и DOM touchpoint

```html
<span class="telemetrics_click" [attr.data-tag]="touchpoint" hidden></span>
<canvas class="analytics_stage" [attr.data-view]="analyticsView" hidden></canvas>
```

Элемент должен существовать в активном DOM ровно в одном экземпляре. Missing/empty/duplicate/oversized marker приводит к `telemetry.unresolved.v1`, а не исключению. Backend должен отклонять fallback для защищаемых операций.

Независимый `canvas.analytics_stage[data-view]` имеет те же правила уникальности, но собственный configured marker и fallback `analytics.unresolved.v1`. Canvas служит источником обобщённой graphics category; graphics не влияет на pa1 score.

## 6. Environments

| Файл | `touchpoint` | `analyticsView` | `telemetryMeasurementId` | `analyticsMeasurementId` |
|---|---|---|---|---|
| `environment.ts` | `production-build-tag` | `production-view-2026.11` | `G-8F3K2M7Q` | `PA-59DK2M8Q` |
| `environment.staging.ts` | `staging-build-tag` | `staging-view-2026.11` | `G-STG-2026` | `PA-STG-2026` |
| `environment.development.ts` | `dsf3fdfgdfg` | `development-view-2026.11` | `G-DEV-2026` | `PA-DEV-2026` |

`data-tag` должен совпадать с ожидаемым значением будущей серверной конфигурации. `pixelUrl` отсутствует: WASM встроен в JS.

## 7. Вне demo и тесты

Реальный PHP endpoint отсутствует; browser test server возвращает generic `403`. `apps/demo-web/tests/conversion-demo.service.test.ts` проверяет `HttpClient`-запросы, generic HTTP results и network failures. `packages/marketing-telemetry/tests/angular-interceptor.test.ts` проверяет headers, pathname, fail-open и отсутствие downstream retry.

`scripts/check-browser.mjs` дополнительно проверяет production Angular с реальным WASM, empty canonical properties, golden login/register, DOM variants, отсутствие `.wasm`-запросов и embedded/lazy network behavior. Полный browser regression выполняется отдельно после быстрых unit/build проверок. `PRODUCT_ONLY=1 npm run test:browser` отключает WebAssembly и подтверждает, что pa1 остаётся валидным, а cv2 headers отсутствуют.
