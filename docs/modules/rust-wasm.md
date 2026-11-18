# Rust/WASM crate `funnel-wasm`

Crate находится в `crates/funnel-wasm`. Он получает API-путь и дополнительные свойства от TypeScript, самостоятельно читает время/DOM и возвращает JSON с `profile`, `pulse`, `score` и каноническими `properties`.

Нормативный алгоритм: [`../../contracts/conversion-v1.md`](../../contracts/conversion-v1.md). Этот документ объясняет реализацию и ответственность файлов, но не заменяет контракт.

## 1. Как читать Rust-код

Для начала достаточно нескольких правил:

- `u32` — беззнаковое 32-битное целое; `u64` — 64-битное.
- `&str` — входная строка, которую функция читает, не становясь владельцем.
- `String` — обычная владеемая строка результата.
- `Result<T, E>` — либо `Ok(value)`, либо `Err(error)`.
- `Option<T>` — либо `Some(value)`, либо `None`.
- `?` после `Result` — при ошибке немедленно вернуть её из функции.
- `&mut` — временная изменяемая ссылка; stages используют её для изменения frame.
- `derive(...)` — автоматически добавляет стандартные возможности struct/enum, например сравнение или Debug.
- `#[cfg(target_arch = "wasm32")]` — включает код только в WASM build.

В отличие от PHP, ошибки `Result` здесь обычно обрабатываются как значения, а не всплывают как исключения.

## 2. Настройка crate — `Cargo.toml`

### Типы библиотеки

```toml
crate-type = ["cdylib", "rlib"]
```

- `cdylib` нужен для WASM-результата;
- `rlib` позволяет запускать обычные native Rust integration tests.

### Зависимости

- `serde_json` — разбор и сериализация свойств/результата.
- `js-sys`, `wasm-bindgen`, `web-sys` — только для target `wasm32`: время, JS boundary и DOM.

### Release profile

- `opt-level = "z"` — оптимизация размера;
- `lto = true` — link-time optimization;
- `codegen-units = 1` — единый codegen unit;
- `strip = true` — удаление символов;
- `panic = "abort"` — отказ от stack unwinding;
- `wasm-opt` — дополнительная оптимизация с явно разрешёнными WASM features.

SHA/HMAC не используются. Это детерминированный обфускационный алгоритм, а не криптографическая схема аутентификации.

## 3. Browser export — `src/lib.rs`

Файл объявляет модули `codec`, `frame`, `journey`, `pulse`, `stages`, `tables`, `touchpoint` и экспортирует в JavaScript одну функцию.

### `calculate_funnel_score`

```rust
pub fn calculate_funnel_score(
    journey: &str,
    properties_json: &str,
) -> Result<String, wasm_bindgen::JsValue>
```

**Где вызывается:** из `TelemetrySdk.getConversionHeaders()` через generated wasm-bindgen glue.

**Вход:**

- `journey` — абсолютный API-путь;
- `properties_json` — JSON-массив пар строк.

**Результат при успехе:** JSON-строка:

```json
{
  "profile": "cv1",
  "pulse": "16 hex",
  "score": "64 hex",
  "properties": [["name", "value"]]
}
```

**Последовательность:**

1. `CanonicalProperties::parse()` проверяет и сортирует свойства.
2. `canonical_json()` заранее создаёт канонический JSON для ответа.
3. `js_sys::Date::now()` получает браузерные миллисекунды.
4. Нефинитное или отрицательное время отклоняется.
5. Миллисекунды преобразуются в целые секунды.
6. `select_window()` выбирает текущее/следующее окно.
7. `current_touchpoint()` получает DOM marker или fallback.
8. `JourneyContext::new()` проверяет входы и вычисляет encoded pulse.
9. `Frame::from_journey()` ещё раз проверяет путь и создаёт initial frame.
10. Все stages из `stages_v1()` последовательно изменяют frame.
11. Канонический JSON свойств превращается в `serde_json::Value` для итогового объекта.
12. `pulse_to_hex()` и `frame.to_hex()` сериализуют результаты.
13. Возвращается компактная JSON-строка.

**Ошибки для JS:** функция возвращает `Err(JsValue)` с общими сообщениями для unsupported properties/context/journey, недоступных часов и ошибки property encoding. TypeScript не создаёт частичные заголовки после такой ошибки.

**Инвариант:** TypeScript не передаёт timestamp и DOM marker как доверенные аргументы; они получаются внутри WASM.

## 4. Путь и контекст — `src/journey.rs`

### `JourneyError`

Struct с приватным `message: String`.

- `new()` создаёт ошибку внутри модуля;
- `Display` выводит сообщение;
- `Error` позволяет использовать стандартную Rust-модель ошибок.

### `validate_journey(journey: &str): Result<(), JourneyError>`

Принимает путь только если:

- длина `1..=512` **UTF-8 bytes**;
- первый символ `/`;
- нет NUL byte;
- нет `?` query или `#` fragment.

`window.location.pathname` не используется: Angular явно передаёт API-путь.

### `JourneyContext`

Хранит неизменяемые входы одного вычисления:

| Поле | Содержимое |
|---|---|
| `journey` | Проверенный путь |
| `touchpoint` | DOM marker или fallback |
| `properties` | Уже канонизированные свойства |
| `selected_window` | Выбранное окно `u64` |
| `pulse` | Два encoded `u32` |

### `JourneyContext::new(...)`

Проверяет journey, требует `touchpoint` длиной `1..=256` UTF-8 bytes, сохраняет owned values и вызывает `encode_pulse(selected_window)`.

### Getters

- `journey()` — путь для `JourneyStage`;
- `touchpoint()` — marker/fallback для `TouchpointStage`;
- `properties()` — свойства для `PropertiesStage`;
- `selected_window()` — decoded window для `PulseStage`;
- `pulse()` — encoded words для `PulseStage` и HTTP header.

Getters не меняют состояние. Это позволяет stages использовать один согласованный контекст.

## 5. DOM — `src/touchpoint.rs`

### `FALLBACK_TOUCHPOINT`

```text
telemetry.unresolved.v1
```

Используется, когда нельзя выбрать ровно один пригодный marker.

### `choose_touchpoint(candidates: &[Option<String>]): String`

Возвращает значение только для массива из одного `Some(value)`, если value непустое и не превышает 256 UTF-8 bytes.

Во всех остальных случаях возвращает fallback:

- нет элементов;
- отсутствует `data-tag`;
- пустое значение;
- несколько элементов;
- значение слишком длинное.

Fallback сохраняет браузерное вычисление детерминированным, но не делает запрос валидным. По контракту будущая demo PHP-проверка ожидает настоящий configured tag и должна отклонять fallback-результат; **fallback нельзя назначать ожидаемым серверным marker**.

### `current_touchpoint(): String` для WASM

1. Получает `window` и `document`.
2. Выполняет `querySelectorAll("span.telemetrics_click")`.
3. Для каждого node пытается получить `Element` и `data-tag`.
4. Передаёт candidates в `choose_touchpoint()`.

Отсутствие window/document или ошибка selector приводит к fallback, а не DOM-исключению.

### Native version

При обычном `cargo test` вне WASM `current_touchpoint()` сразу возвращает fallback, поэтому native-тесты не требуют браузерного JS host.

## 6. Свойства — `src/codec.rs`

### Ограничения

| Правило | Значение |
|---|---|
| Входной JSON | До 4096 bytes |
| Количество пар | До 32 |
| Имя | `[a-z0-9_.-]{1,64}` |
| Значение | До 512 UTF-8 bytes; пустое разрешено |
| Дубликаты имён | Запрещены |
| Reserved names | `sys.journey`, `sys.touchpoint`, `sys.pulse`, `sys.profile` |

Имя и значение должны быть строками. Объекты, числа, boolean, null, вложенные структуры и пары неправильной длины отклоняются.

### `PropertyError`

Содержит конкретное validation message для разработчика/tests. На browser boundary `lib.rs` преобразует ошибку в общее `unsupported conversion properties`.

### `CanonicalProperties`

Struct с `pairs: Vec<(String, String)>`. Пары принадлежат struct и отсортированы по bytes имени, поэтому результат не зависит от порядка входного JSON.

### `CanonicalProperties::parse(input: &str)`

1. Проверяет размер входа.
2. Разбирает JSON и требует верхнеуровневый array.
3. Проверяет количество.
4. Требует от каждого элемента array ровно из двух строк.
5. Проверяет имя, значение и уникальность через `BTreeSet`.
6. Сохраняет owned pairs.
7. Сортирует по `name.as_bytes()`.

Любая ошибка возвращает `Err(PropertyError)` без panic в WASM.

### `canonical_json(): String`

Создаёт компактный отсортированный JSON-массив пар без пробелов. Escape-правила реализованы отдельно, чтобы совпасть с контрактом и будущим PHP mirror.

### `write_bytes(output: &mut Vec<u8>)`

Добавляет для каждой пары:

```text
u32le(name byte length) || name bytes || u32le(value byte length) || value bytes
```

Метод именно добавляет данные в существующий Vec, а не очищает его. Пустой список ничего не добавляет.

### Внутренние helpers

- `validate_name()` — grammar, длина и reserved namespace.
- `append_length_prefixed()` — little-endian `u32` длина + bytes.
- `write_json_string()` — экранирует quotes, backslash и controls; не экранирует `/`; не-ASCII записывает непосредственно в UTF-8.

## 7. Время и pulse — `src/pulse.rs`

### `select_window(now_seconds: u64): u64`

- Делит время на 180-second intervals.
- Находит начало и конец текущего окна.
- Если до конца осталось **строго меньше 15 секунд**, выбирает следующее окно.
- Ровно 15 секунд — ещё текущее окно.

Это клиентский boundary buffer, а не серверное правило допустимых окон.

### `encode_pulse(window: u64): (u32, u32)`

1. Разделяет window на low/high 32-bit words.
2. Применяет XOR masks.
3. Выполняет два фиксированных Feistel-like раунда с add/rotate.
4. Применяет output masks.

Результат обратим. Это представление времени, а не односторонний hash или секрет.

### `decode_pulse(parts: (u32, u32)): u64`

Применяет обратные операции в обратном порядке и восстанавливает window. Будущий PHP должен также проверить каноничность повторным кодированием.

### `pulse_to_hex(parts): String`

Сериализует каждый word как little-endian bytes и записывает 16 lowercase hex-символов.

## 8. Frame и арифметика — `src/frame.rs`

### Функции фиксированной ширины

- `add32()` — `wrapping_add`, сложение modulo 2^32;
- `sub32()` — `wrapping_sub`;
- `mul32()` — `wrapping_mul`;
- `rotl32()` — rotate left на `shift % 32`;
- `rotr32()` — rotate right на `shift % 32`.

`wrapping_*` важны: overflow — часть алгоритма, а не ошибка.

### `Frame`

```rust
pub struct Frame(pub [u32; 8])
```

Восемь 32-bit lanes — всё изменяемое состояние вычисления.

### Методы

- `initial()` — возвращает `tables::INITIAL`.
- `from_journey()` — проверяет путь и возвращает initial frame; путь поглощается позже отдельной stage.
- `from_lanes()` — восстанавливает frame из fixtures/intermediate lanes.
- `lanes()` — read-only slice для сравнений.
- `lanes_mut()` — mutable array для stage.
- `to_hex()` — little-endian bytes каждой lane в 64 lowercase hex-символа.

## 9. Константы — `src/tables.rs`

| Константа | Роль |
|---|---|
| `INITIAL` | Восемь начальных lanes `cv1` |
| `MULTIPLIERS` | Нечётные multipliers для absorb/diffuse |
| `ADDITIVES` | Additive masks после rotations |
| `PERMUTATION` | Cross-lane read order |
| `SUBSTITUTION` | Замена high/low nibbles byte |

Значения нельзя менять как обычные настройки: любое изменение меняет `score` и требует новой версии контракта/fixtures/backend mirror.

## 10. Стадии — `src/stages.rs`

### `FunnelStage`

Trait с методом:

```rust
fn apply(&self, frame: &mut [u32; 8], context: &JourneyContext)
```

Каждая stage изменяет общий frame, читая неизменяемый `JourneyContext`.

### `stages_v1(): Vec<Box<dyn FunnelStage>>`

Возвращает точный порядок:

```text
JourneyStage → TouchpointStage → PropertiesStage → PulseStage
```

`Box<dyn FunnelStage>` — объект trait в heap, позволяющий хранить разные stage types в одном списке.

### Четыре stages

| Stage | Payload | Domain | Diffuse rounds |
|---|---|---:|---:|
| `JourneyStage` | UTF-8 bytes API path | `0x4a` | 4 |
| `TouchpointStage` | UTF-8 bytes marker/fallback | `0xb7` | 4 |
| `PropertiesStage` | Length-prefixed canonical pairs | `0xd9` | 4 |
| `PulseStage` | `u32le(out0) || u32le(out1) || u64le(window)` | `0xe3` | 8 |

Каждая вызывает `absorb()`, затем `settle_frame()`. Пустой properties payload всё равно проходит stage с domain и нулевой длиной.

### `absorb(frame, domain, payload, rounds)`

1. Формирует `domain || u32le(payload length) || payload`.
2. Последовательно обрабатывает каждый byte.
3. Выбирает lane по индексу, делает substitution, XOR/multiply/rotate/add.
4. Дополнительно изменяет другую lane через cross-lane XOR.
5. Изменения видны следующим итерациям.
6. Вызывает `diffuse()`.

Точные формулы находятся в разделе 5.1 контракта.

### `substitute(value: usize): u8`

Применяет `SUBSTITUTION` отдельно к младшему и старшему nibble и объединяет результат.

### `diffuse(frame, rounds)`

Для каждого раунда сначала копирует весь frame в `old`. Все новые lanes вычисляются только из `old`, поэтому частично обновлённый текущий раунд не влияет на соседние вычисления.

### `settle_frame(frame, domain, rounds)`

Выполняет дополнительные bounded runtime-directed вычисления:

- создаёт `matrix` и `drift` из результата stage;
- использует `black_box`, чтобы сохранить runtime data flow;
- выбирает одну из двух projections по вычисленному selector;
- возвращает frame к значению, которое было после `absorb/diffuse`.

Это обфускация потока выполнения. Нормативный результат stage меняться не должен.

### `project_add()` и `project_xor()`

Два варианта восстановления original lanes:

- `(original + drift) - drift = original` в modulo 2^32;
- `(original XOR mask) XOR mask = original`.

`#[inline(never)]` сохраняет их отдельными функциями. Внутренние unit tests проверяют эквивалентность на 10 000 frames и `settle_frame` ещё на 10 000 вариантов.

## 11. Тестовые гарантии

| Файл | Что проверяет |
|---|---|
| `tests/codec_tests.rs` | Golden canonical JSON/bytes, limits, malformed shapes, duplicates/reserved names, escaping/UTF-8 |
| `tests/frame_tests.rs` | Arithmetic vectors, initial frame, malformed journeys, final score serialization |
| `tests/touchpoint_tests.rs` | Single valid marker, missing/empty/duplicate/oversized fallback, ровно 256 UTF-8 bytes |
| `tests/pulse_tests.rs` | Golden encode/decode/hex, boundary 15/14 seconds, 10 000 round trips |
| `tests/stage_tests.rs` | Каждый intermediate frame против fixtures, final score, 100 повторов без global state, native median budget |
| `src/stages.rs` internal tests | Эквивалентность projections и settle на 10 000 generated cases |
| TypeScript/browser tests | Реальный WASM и совпадение HTTP-заголовков |

Запуск native tests:

```bash
cargo test --manifest-path crates/funnel-wasm/Cargo.toml
```

Для project-local toolchain сначала используйте environment из [`../frontend-guide.md`](../frontend-guide.md#rust).

## 12. Как безопасно подходить к изменениям

### Можно рефакторить при неизменном результате

- Разносить helpers по функциям.
- Улучшать названия и комментарии.
- Менять внутреннюю реализацию, если все intermediate fixtures и final score совпадают.
- Улучшать ошибки, сохраняя внешний generic boundary.

### Требует изменения контракта и backend

- Порядок stages.
- Константы, domains, rounds, arithmetic и serialization.
- Выбор времени/DOM.
- Property grammar, sorting, canonical JSON/bytes.
- Формат `pulse`, `score`, `properties` или headers.

Перед такой доработкой нужно явно решить версионирование `cv1`: существующие golden fixtures не следует просто переписывать под новый результат без обновления нормативного алгоритма.
