# Три заголовка на независимый analytics-контур

Дата: 2026-11-20
Статус: утверждено пользователем для реализации

## Назначение

Сократить полный комплект с 11 до 6 пользовательских HTTP-заголовков и придать каждому пакету понятную analytics-модель: идентификатор проекта, session/time marker и данные события с проверяемым результатом внутри.

Изменяется только транспортное представление существующих `cv2` и `pa1` результатов. Математика, WASM sampling, TypeScript pipeline, timestamp, click/event IDs, DOM fallback, properties и snapshot semantics сохраняются.

## Транспортный контракт

Каждый пакет создаёт ровно три заголовка:

| Назначение | Marketing/WASM | Product/TypeScript |
|---|---|---|
| Публичный project/counter ID | `X-GA-Measurement-Id` | `X-PA-Measurement-Id` |
| Обратимый timestamp (`pulse`) | `X-GA-Session-Id` | `X-PA-Session-Id` |
| Base64url canonical event envelope | `X-GA-Session-Properties` | `X-PA-Session-Properties` |

Удаляются отдельные заголовки `score`, `clickId`/`eventId` и статического client marker. Они переносятся в envelope.

Идентификатор проекта является публичной environment-конфигурацией, а не секретом. Backend использует его для выбора проектной конфигурации. Он не заменяет `v` в envelope и не является доказательством подлинности клиента.

## Envelope

Оба envelope представляются каноническим JSON в UTF-8 и кодируются base64url без padding. Используются короткие нейтральные имена:

- `v` — версия профиля (`cv2` или `pa1`);
- `eid` — финальный `clickId` или `eventId`;
- `sum` — существующий `score` (64 hex для `cv2`, 32 hex для `pa1`);
- `client` — существующий static client marker только для `cv2`;
- `props` — существующий canonical pair array для `cv2`;
- `data` — существующий serialized analytics snapshot для `pa1`.

Лишние поля запрещены. Порядок ключей канонический: для `cv2` — `client`, `eid`, `props`, `sum`, `v`; для `pa1` — `data`, `eid`, `sum`, `v`. Вложенное кодирование snapshot сохраняется в текущей итерации, чтобы не менять `pa1` snapshot contract.

Названия являются маскировкой, не шифрованием. Клиентский код и структура доступны атакующему.

## Конфигурация

В environment/demo добавляются отдельные публичные project IDs для двух пакетов. Значения передаются в SDK через настройки/factory, не зашиваются как общая константа для всех проектов.

Для обратной совместимости ручного API настройки принимаются через существующие facade constructors/providers. Angular interceptor получает настроенный application-wide facade. Отсутствующий или некорректный project ID является ошибкой генерации: interceptor выполняет fail-open, удаляя только три заголовка своего пакета.

## Ошибки и независимость

- Успешная генерация атомарно заменяет три package-owned headers.
- При ошибке генерации все три заголовка соответствующего пакета удаляются, включая pre-existing/stale значения.
- Unrelated headers и три заголовка другого пакета сохраняются.
- Downstream HTTP errors не перехватываются как generation failures и не вызывают retry.
- Порядок независимых interceptors не влияет на результат; telemetry/interceptor URL rewrites по-прежнему выполняются до вычисления.
- Нативные `fetch`/XHR остаются вне interceptor coverage.

## Backend

PHP implementation по-прежнему не реализуется. Pseudocode и контракты обновляются:

1. Проверить ожидаемый project ID.
2. Декодировать `pulse`, проверить каноничность и timestamp policy.
3. Декодировать base64url envelope, строго проверить JSON shape и каноничность.
4. Извлечь `eid`, `sum`, `client`/`props`/`data` и `v`.
5. Пересчитать существующий `cv2`/`pa1` результат по нормативному алгоритму.

Backend не принимает unresolved DOM/view marker как настоящий configured marker. Поля, не входящие в существующий score, остаются ненадёжной analytics-информацией.

## Проверки

- Source/unit tests обоих facades и interceptors, включая exact three-name sets, project configuration, envelope round-trip, malformed values, fail-open и другой пакет.
- Обновлённые golden transport fixtures для `cv2` и `pa1`; существующие algorithm vectors не пересчитываются.
- Browser/packed Angular checks ожидают ровно шесть package-owned headers в полном режиме и три в product-only mode.
- Release/artifact tests проверяют удалённые имена и отсутствие revealing terminology.
- Полный build, TypeScript/Rust tests, release, packed embedded/lazy/product-only и browser regression.

## Вне объёма

- Переход на один заголовок на пакет.
- Изменение score algorithms, snapshot fields, click sampling и timestamp policy.
- Nonce, replay cache, request-body/method binding, server challenge.
- PHP implementation, Worker, CSP changes и production compatibility с недоступным боевым приложением.
