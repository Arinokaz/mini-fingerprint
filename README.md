# Telemetry Wasm MVP

Локальный MVP на Angular, TypeScript и Rust/Wasm. Клиентский API оформлен как маркетинговая телеметрия. Wasm получает API-путь, DOM-атрибут `span.telemetrics_click[data-tag]`, дополнительные свойства и текущее время. Независимая реализация зеркальной проверки на PHP 8.4 отложена; её псевдокод сохранён в документации.

> Проект повышает стоимость статического анализа, но не доказывает подлинность браузера. Это не криптографическая схема и не замена серверным ограничениям brute-force.

## Текущий статус

Реализуется по [плану](docs/superpowers/plans/2026-11-16-telemetry-wasm-mvp.md).

- [x] Инициализация репозитория и ветки разработки.
- [x] Контракт `cv1` и эталонные векторы.
- [x] Чистое Rust-ядро.
- [x] Wasm-интеграция и локальный NPM-пакет.
- [x] Angular demo и production-сборка.
- [x] Проверка реальных заголовков в браузере и DOM-fallback сценариев.
- [x] PHP-псевдокод для будущей зеркальной реализации.
- [ ] PHP mirror и endpoints — отложено по решению владельца проекта.
- [x] Руководство по структуре и сборке фронтенда.
- [ ] Дополнительная документация по расширению алгоритма.

## Требования

- Node.js `^22.12.0 || >=24.0.0` и npm, совместимые с Angular 21.
- Rust stable через `rustup`, target `wasm32-unknown-unknown`.
- `wasm-pack` для последующих этапов.
- PHP 8.4+ и Composer понадобятся только для отложенного серверного этапа.
- Существующий Chromium/Chrome для browser-проверки; Playwright и дополнительные браузеры не требуются.
- Python 3 не требуется для работы проекта: эталонные fixtures уже сохранены в репозитории.

## Структура

Подробная карта всех исходников, generated-файлов и команд: [`docs/frontend-guide.md`](docs/frontend-guide.md).

Сборка WASM без повторной установки Rust на каждой машине, создание локального `.tgz`, подключение пакета к другому Angular-проекту и production-деплой: [`docs/deployment.md`](docs/deployment.md).

```text
apps/demo-web/                    Angular demo
packages/marketing-telemetry/     Локальный TypeScript NPM-пакет
crates/funnel-wasm/               Rust и браузерный Wasm-интерфейс
docs/php-mirror-pseudocode.md     Псевдокод отложенной PHP-реализации
contracts/conversion-v1.md       Нормативный протокол
tests/fixtures/conversion-v1.json Общие Rust/PHP golden vectors
scripts/                         Проверки и сборка
```

## Проверка контракта

```bash
node scripts/check-contract.mjs
# или
npm run check:contract
```

Проверка валидирует структуру fixtures, границы временных окон, формат состояний и итоговых значений. Побитовое совпадение Rust с fixtures проверяется отдельным набором Rust-тестов.

## Фронтенд: сборка и проверка

```bash
npm install
npm run build
npm test
npm run test:browser
```

- `build:wasm` собирает `packages/marketing-telemetry/pkg/pixel.wasm` без SHA/HMAC и встраивает его байты base64-строкой в `src/generated-pixel.ts`.
- `build:npm` создаёт минифицированные `embedded` (один JS) и `lazy` (facade + `pixel.<hash>.js`) архивы, а также `release/size-report.json` с фактическими размерами.
- NPM runtime декодирует base64 в `Uint8Array`; отдельный `.wasm` HTTP-запрос и копирование в Angular public assets не используются.
- `npm test` проверяет контракт, TypeScript-фасад, оба собранных варианта, реальный Wasm с запрещённым `fetch` и сервис отправки.
- `test:browser` запускает production Angular, проверяет отсутствие запроса `pixel.wasm`, точные значения заголовков, валидный/missing/empty/duplicate DOM и login/register.
- `test:package:angular` устанавливает каждый `.tgz` в изолированный Angular demo и дополнительно проверяет отсутствие лишних chunks в embedded и однократную lazy-загрузку.
- В WSL скрипт автоматически использует существующие Windows Node.js 22+ и Chrome только при выборе Windows-браузера. Явный Linux `CHROME_BIN` имеет приоритет; делегирование Windows можно запретить через `BROWSER_CHECK_NO_WINDOWS=1`.
- Browser-проверка сверяет production `pulse` и `score` с независимыми golden fixtures и декодирует свойства всех пяти запросов.

PHP endpoints сейчас не реализованы. Browser-сервер намеренно возвращает generic `403`, чтобы проверить отправку заголовков и пользовательский статус без backend.

## Протокол в двух словах

Восемь слов `u32` последовательно проходят этапы `journey`, `touchpoint`, `properties` и `pulse`. Результат — 256 бит в виде 64 строчных hex-символов. Временное окно кодируется обратимо и передаётся отдельно в виде 16 hex-символов. Никакие SHA, MD5 или HMAC не используются.

Полное описание: [`contracts/conversion-v1.md`](contracts/conversion-v1.md). Будущая серверная часть: [`docs/php-mirror-pseudocode.md`](docs/php-mirror-pseudocode.md).
