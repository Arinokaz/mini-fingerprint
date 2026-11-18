# Angular demo

Демонстрационное приложение находится в `apps/demo-web`. Его задача — показать реальную интеграцию npm-пакета и проверить заголовки/WASM в браузере. Это не готовая форма авторизации и не backend.

## 1. Запуск приложения — `src/main.ts`

```typescript
bootstrapApplication(App, {
  providers: [provideZonelessChangeDetection()],
});
```

- Используется standalone component `App`.
- Zone.js не подключается; изменение состояния построено на signals.
- Ошибка bootstrap выводится в `console.error`.

В реальном приложении пакет можно подключать без копирования способа bootstrap.

## 2. Компонент `App` — `src/app/app.ts`

### Назначение

Связывает шаблон demo, `TelemetrySdk` и `ConversionDemoService`, управляет состоянием отправки.

### Свойства

| Свойство | Назначение |
|---|---|
| `touchpoint` | Значение `data-tag` из текущего environment |
| `status` | Signal с пользовательским состоянием операции |
| `busy` | Signal, запрещающий повторный submit во время запроса |
| `telemetry` | Экземпляр настоящего `TelemetrySdk` |
| `demo` | Сервис отправки, получающий telemetry через constructor |

`telemetry` и `demo` являются приватными: шаблон использует публичный сценарий `submit`, а не детали пакета.

### Метод `submit`

```typescript
protected async submit(
  journey: ApiJourney,
  email: string,
  password: string,
): Promise<void>
```

**Где вызывается:** из `(click)` кнопок login/register в `app.html`.

**Логика:**

1. Если `busy()` уже истинно, метод завершается — второй запрос не начинается.
2. Устанавливает `busy=true` и статус «Отправка запроса…».
3. Вызывает `demo.submit(journey, email, password)`.
4. Показывает generic message и HTTP status из результата.
5. При исключении пишет техническую ошибку в console, а пользователю показывает только «Не удалось выполнить запрос.».
6. В `finally` снимает `busy` независимо от результата.

**Side effects:** косвенно загружает/инициализирует WASM и выполняет HTTP-запрос.

**Инвариант:** credentials не записываются в состояние компонента или отдельное хранилище; значения передаются непосредственно в сервис.

## 3. Сервис `ConversionDemoService` — `src/app/conversion-demo.service.ts`

### Назначение

Координирует получение telemetry-заголовков и последующий POST. Именно здесь важен порядок «сначала вычисление, сразу затем отправка».

### Тип `ApiJourney`

```typescript
type ApiJourney = '/api/auth/login' | '/api/auth/register'
```

Разрешает только два demo-пути на уровне TypeScript.

### Интерфейс `ConversionClient`

Структурный контракт:

```typescript
getConversionHeaders(
  actionPath: string,
  properties?: Record<string, string>,
): Promise<Record<string, string>>
```

Сервис зависит от этой минимальной формы, а не от конкретных деталей WASM. `TelemetrySdk` соответствует ей автоматически. Тесты могут передать контролируемую реализацию.

### Интерфейс `SubmissionResult`

```typescript
{
  status: number;
  message: string;
}
```

Это результат для компонента, а не исходный ответ сервера.

### Constructor

```typescript
constructor(
  private readonly conversions: ConversionClient,
  private readonly fetcher: typeof fetch =
    (input, init) => globalThis.fetch(input, init),
)
```

Первый параметр — telemetry client, второй — сетевой boundary для тестов.

Default `fetcher` специально вызывает `globalThis.fetch(...)` как метод глобального объекта. Это сохраняет корректный browser receiver и проверяется отдельным тестом.

### Метод `submit`

```typescript
async submit(
  journey: ApiJourney,
  email: string,
  password: string,
): Promise<SubmissionResult>
```

**Логика:**

1. Определяет `actionName`: путь, заканчивающийся `/register`, получает `register`, остальной разрешённый union — `login`.
2. Вызывает `getConversionHeaders(journey, { form: actionName })`.
3. Выполняет `fetch(journey, ...)` с:
   - `method: 'POST'`;
   - `credentials: 'same-origin'`;
   - всеми пятью telemetry-заголовками;
   - `Content-Type: application/json`;
   - JSON body `{ email, password }`.
4. Возвращает HTTP status и одно из двух generic сообщений по `response.ok`.

**Ошибки:** исключения conversion/network не перехватываются внутри сервиса; их получает `App.submit`.

**Чего метод не делает:** не читает тело отклонённого ответа, не показывает серверные детали, не добавляет timestamp в JSON body и не сохраняет credentials.

## 4. Шаблон — `src/app/app.html`

### Inputs

Template reference variables `#email` и `#password` дают текущие `.value` при нажатии. Это demo-упрощение, не reactive forms implementation.

### Buttons

- Login вызывает `submit('/api/auth/login', email.value, password.value)`.
- Register вызывает `submit('/api/auth/register', ...)`.
- `[disabled]="busy()"` блокирует обе кнопки во время операции.

### Статус

```html
<p role="status" aria-live="polite">{{ status() }}</p>
```

`aria-live` помогает assistive technology получить изменение состояния.

### DOM touchpoint

```html
<span class="telemetrics_click" [attr.data-tag]="touchpoint" hidden></span>
```

Именно этот элемент ищет Rust. `hidden` скрывает его визуально, но оставляет в DOM. Он должен существовать к моменту вычисления и быть ровно одним.

## 5. Environments

| Файл | `touchpoint` |
|---|---|
| `environment.ts` | `production-build-tag` |
| `environment.staging.ts` | `staging-build-tag` |
| `environment.development.ts` | `dsf3fdfgdfg` |

Angular `fileReplacements` выбирает development/staging версию. Значение должно быть согласовано с конфигурацией будущей серверной проверки. `pixelUrl` отсутствует: WASM встроен в пакет.

## 6. Что находится вне demo

- Реального PHP endpoint нет.
- Browser test server возвращает generic `403` для `/api/*`.
- Demo не реализует хранение учётных записей, сессии, rate limiting или серверную mirror-проверку.
- [`../deployment.md`](../deployment.md) содержит отдельный пример с Angular `HttpClient`; текущий demo сознательно использует `fetch`.

## 7. Связанные тесты

`apps/demo-web/tests/conversion-demo.service.test.ts` проверяет:

1. Точный journey, telemetry-заголовки, JSON body и отсутствие plaintext timestamp.
2. Отдельный register path: **unit-тест проверяет только register path** и не проверяет переданные properties. Значение `form=register` отдельно подтверждается browser assertion в корневом `scripts/check-browser.mjs`.
3. Generic результат для `403` без серверных деталей.
4. Корректный receiver у default `fetch`.
5. Видимость network/conversion исключений для компонента.

`scripts/check-browser.mjs` дополнительно проверяет production Angular с реальным WASM, golden login/register, valid/missing/empty/duplicate DOM, отсутствие `.wasm`-запросов и embedded/lazy network behavior.

При переносе пакета в другое приложение можно сохранить собственный Angular component/service; обязательными являются совместимый вызов `TelemetrySdk`, передача всех заголовков и DOM-контракт.
