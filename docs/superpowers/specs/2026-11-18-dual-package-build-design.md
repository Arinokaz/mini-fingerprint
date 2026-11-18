# Дизайн двух вариантов распространения telemetry npm-пакета

## Назначение

Дать Angular-команде готовый локальный npm-пакет, который уже минимизирован и не зависит от настроек минификации потребителя. Пакет должен поставляться в двух взаимозаменяемых вариантах: `embedded` с одним JS-файлом и `lazy` с небольшим facade и отдельным JS chunk, содержащим base64-WASM.

## Цели

- Сохранить публичный API: `new TelemetrySdk()` и `getConversionHeaders(actionPath, properties)`.
- Собирать оба варианта из одних TypeScript/Rust-исходников, без дублирования алгоритма.
- Минифицировать facade, runtime и generated wasm-bindgen glue до создания `.tgz`; удалить комментарии и не создавать source maps.
- Не поставлять `src/`, Rust-исходники, внутренние документы или отдельный `.wasm` в npm-архивах.
- В `embedded` объединять runtime и base64 в `dist/index.js`; в `lazy` загружать один `dist/pixel.<hash>.js` только при первом обращении к runtime.
- Сохранить однократную инициализацию, разделение concurrent-вызовов и повтор после ошибки через `RuntimeGate`.
- Создавать два независимых локально устанавливаемых `.tgz` с одинаковыми package name/version и явными суффиксами имён файлов `embedded`/`lazy`.
- Выводить фактические размеры raw WASM, base64 и JS-файлов каждого варианта; не вводить произвольный лимит до получения baseline.
- Обновить руководство по выдаче пакета фронтендам, не требуя изменений `angular.json`.

## Нецели и ограничения

- Не менять Rust-алгоритм, заголовки, DOM-контракт или golden fixtures.
- Не добавлять gzip/DecompressionStream и новый runtime-dependency: сначала нужны измерения.
- Не утверждать, что минификация/base64 делают невозможным reverse engineering.
- Не полагаться на Angular production optimization: пакет должен оставаться минимизированным и в development-сборке потребителя.
- Не помещать оба варианта в один `.tgz`, чтобы не дублировать base64-WASM.
- Не публиковать пакеты в registry; только локальные архивы.

## Подходы

1. **Общий источник runtime + два режима bundling — выбрано.** Выделить модуль, который статически объединяет base64 и wasm-bindgen glue, а публичный runtime загружает его через dynamic import. Bundler в режиме `embedded` встраивает этот модуль в entry, а в режиме `lazy` создаёт content-hashed chunk. Это сохраняет общий API и не требует двух реализаций.
2. **Два независимых entry/loader — отклонено.** Даёт контроль, но дублирует public facade и увеличивает риск расхождения вариантов.
3. **Один пакет с subpath exports `embedded`/`lazy` — отклонено.** Архив содержал бы обе копии WASM, а результат зависел бы от tree-shaking потребителя.
4. **Только lazy или только embedded — отклонено.** Не удовлетворяет одновременно требованиям маскировки в общем bundle и контроля стартового размера.

## Архитектура реализации

### Runtime

- `src/runtime.ts` сохраняет `RuntimeGate` и `loadPixelRuntime`, но загружает вычислительный модуль через один dynamic `import()`.
- Новый внутренний `src/pixel-runtime.ts` статически импортирует `PIXEL_BASE64` и generated glue, декодирует base64 и инициализирует WebAssembly из `Uint8Array` без `fetch`.
- В исходных TypeScript-тестах dynamic import работает напрямую. В `embedded` bundler устраняет отдельный chunk; в `lazy` создаёт только `pixel-[hash].js`.

### Сборка

- Добавить прямую dev-dependency `esbuild` в `packages/marketing-telemetry`.
- Скрипт сборки использует TypeScript для declarations и esbuild для browser ESM JavaScript с `bundle`, `minify`, `format=esm`, `target=es2022`, `legalComments=none`, `sourcemap=false`.
- Обычная команда `npm run build --workspace @company/marketing-telemetry` остаётся совместимой и создаёт `embedded` в `dist/` для demo.
- Отдельная release-команда строит оба варианта в независимые staging-каталоги, копирует/адаптирует manifest и выполняет `npm pack`. Архивы сохраняются как `company-marketing-telemetry-<version>-embedded.tgz` и `company-marketing-telemetry-<version>-lazy.tgz`.
- Root `npm run build` продолжает собирать WASM, пакет и demo. Дополнительная команда выпуска обоих архивов документируется отдельно.
- `files` npm-пакета ограничивается `dist`; generated `pkg/` нужен на сборочной машине, но больше не включается в архив, потому что glue уже встроен в минимизированный JS.

### Проверки

- Существующие unit/integration tests сохраняют проверку API, RuntimeGate и реального WASM.
- Тесты embedded-архива проверяют один runtime JS entry, отсутствие `.wasm`, `.map`, `src/`, `pkg/`, документов и комментариев.
- Во всех поставляемых `.js` и `.d.ts` сканируются термины `security`, `protection`, `secret`, `token`, `attack`, `bot`, `signature`, `authentication`, `authorization` без учёта регистра. Перед сканированием JS длинные base64-литералы исключаются, чтобы случайная последовательность символов не создавала ложное срабатывание. Декодированный WASM этой строковой проверкой не охватывается; Rust release `strip` уже включён. Нейтральный публичный/внутренний термин `calculate_funnel_score` сохраняется.
- Тесты lazy-архива проверяют `index.js` и ровно один `pixel.<hash>.js`; base64 находится только в chunk; facade меньше embedded entry.
- Smoke-тесты импортируют собранный embedded и lazy JS и получают одинаковые golden headers при запрещённом `fetch`.
- Для lazy проверяется, что импорт facade не загружает chunk, а concurrent-вызовы используют одну инициализацию.
- Release-проверка устанавливает **каждый** `.tgz` в отдельную изолированную копию Angular demo и выполняет production build/browser checks. Недостаточно проверять lazy только прямым Node ESM import: Angular должен корректно разрешить и загрузить prebuilt dynamic-import chunk.
- Release size report содержит raw/base64/JS/gzip-размеры и сохраняется вне npm-архивов.
- Полный `npm test`, production Angular build и browser checks выполняются после реализации при доступном Rust/wasm-pack; если среда по-прежнему не содержит toolchain, это явно фиксируется, а выполнимые source/build-fixture проверки не выдаются за end-to-end WASM verification.

## Документация

`docs/deployment.md` получает раздел выбора варианта, команды выпуска, имена архивов, различия Network/размера и одинаковый пример установки/API. Внутренняя документация не входит в архивы.
