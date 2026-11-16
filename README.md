# Telemetry Wasm MVP

Локальный MVP на Angular, TypeScript, Rust/Wasm и PHP 8.4. Клиентский API оформлен как маркетинговая телеметрия. Wasm получает API-путь, DOM-атрибут `span.telemetrics_click[data-tag]`, дополнительные свойства и текущее время, а PHP независимо повторяет собственный 32-битный алгоритм.

> Проект повышает стоимость статического анализа, но не доказывает подлинность браузера. Это не криптографическая схема и не замена серверным ограничениям brute-force.

## Текущий статус

Реализуется по [плану](docs/superpowers/plans/2026-11-16-telemetry-wasm-mvp.md).

- [x] Инициализация репозитория и ветки разработки.
- [x] Контракт `cv1` и эталонные векторы.
- [x] Чистое Rust-ядро.
- [ ] Wasm-интеграция и локальный NPM-пакет.
- [ ] Зеркальная реализация PHP.
- [ ] Angular demo и PHP endpoints.
- [ ] Сквозные тесты и production-сборка.
- [ ] Документация по расширению.

## Требования

- Node.js 22+ и npm.
- Rust stable через `rustup`, target `wasm32-unknown-unknown`.
- `wasm-pack` для последующих этапов.
- PHP 8.4+ и Composer для серверных этапов.
- Python 3 не требуется для работы проекта: эталонные fixtures уже сохранены в репозитории.

## Структура

```text
apps/demo-web/                    Angular demo
packages/marketing-telemetry/     Локальный TypeScript NPM-пакет
crates/funnel-wasm/               Rust и браузерный Wasm-интерфейс
server/                           PHP 8.4 mirror и demo routes
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

Проверка валидирует структуру fixtures, границы временных окон, формат состояний и итоговых значений. Побитовое совпадение вычислений будут проверять Rust- и PHP-тесты следующих этапов.

## Протокол в двух словах

Восемь слов `u32` последовательно проходят этапы `journey`, `touchpoint`, `properties` и `pulse`. Результат — 256 бит в виде 64 строчных hex-символов. Временное окно кодируется обратимо и передаётся отдельно в виде 16 hex-символов. Никакие SHA, MD5 или HMAC не используются.

Полное описание: [`contracts/conversion-v1.md`](contracts/conversion-v1.md).
