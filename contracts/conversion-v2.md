# Контракт `conversion-v2` (`cv2`)

## 1. Назначение и связь с `cv1`

`cv2` добавляет к `conversion-v1` передаваемый идентификатор `clickId`, отдельную стадию вычисления и настраиваемый отбор результата по начальным hex-символам. Это по-прежнему обфускационный механизм, а не криптографическая аутентификация браузера.

Базовые типы, константы, операции кадра, journey, touchpoint, properties и pulse полностью наследуются от [`conversion-v1.md`](conversion-v1.md), включая ограничения входов и точный timestamp. Разделы 2–5 и 6 документа `cv1` являются частью `cv2` без изменений. Нормативные отличия перечислены ниже.

`cv1` не изменяется. Эталонные значения `cv2` находятся в `tests/fixtures/conversion-v2.json`.

## 2. `clickId`

### 2.1. Представление

`clickId` состоит из четырёх слов `u32` и сериализуется как:

```text
u32le(word0) || u32le(word1) || u32le(word2) || u32le(word3)
```

Получаются ровно 16 байт. В HTTP и runtime JSON они представляются 32 строчными hex-символами в порядке этих байт.

`clickId` не является секретом. Его криптографическая непредсказуемость не требуется.

### 2.2. Инкремент

Перебор использует `incremented(clickId)`: 128-битное значение увеличивается на единицу modulo `2^128`. Перенос идёт от слова 0 к слову 3 в little-endian представлении. После `[0xffffffff; 4]` получается `[0; 4]`.

### 2.3. Начальное значение в браузере

Browser binding формирует начальные четыре слова без cryptographic API. Используются `Math.random()`, текущее время, `performance.now()` и монотонный счётчик вызовов runtime.

Для каждого слова сначала вычисляется:

```text
randomWord(i) = floor(Math.random() * 2^32) как u32
```

Затем:

```text
word0 = randomWord0 XOR low32(Date.now milliseconds)
word1 = randomWord1 XOR high32(Date.now milliseconds)
word2 = randomWord2 XOR low32(floor(performance.now() * 1000))
word3 = randomWord3 XOR runtimeCallCounter
```

`runtimeCallCounter` начинается с нуля и увеличивается на единицу для каждого вызова. `Date.now()` читается один раз и одновременно определяет timestamp текущего вызова. Начальное значение не является нормативным результатом: сервер принимает любой корректно переданный `clickId`, для которого совпадают все проверки.

## 3. Дополнительная click-стадия

Для `clickId` используются его 16 байт из раздела 2.1:

```text
frame = absorb(frame, 0xc1, clickIdBytes, 4)
```

После `absorb` применяются те же разрешённые дополнительные bounded-вычисления, что в других Wasm-стадиях. Они не должны изменять нормативный frame.

Полный порядок `cv2`:

```text
frame = INITIAL
frame = absorb(frame, 0x4a, utf8(journey), 4)
frame = absorb(frame, 0xb7, utf8(selectedTouchpoint), 4)
frame = absorb(frame, 0xd9, canonicalPropertyBytes, 4)
frame = absorb(frame, 0xc1, clickIdBytes, 4)
pulsePayload = u32le(out0) || u32le(out1) || u64le(selectedTimestamp)
frame = absorb(frame, 0xe3, pulsePayload, 8)
score = hex(u32le(frame[0]) || ... || u32le(frame[7]))
```

## 4. `scorePrefix` и поиск результата

`scorePrefix` является конфигурацией приложения и будущего backend, а не доверенным полем запроса. Поддерживаются только:

```text
""
"0"
"00"
"000"
```

Значение по умолчанию: `"00"`. Результат подходит, когда его 64-символьный hex выполняет:

```text
score.startsWith(scorePrefix)
```

Пустой префикс принимает первый результат. Остальные значения, включая более трёх символов и любые ненулевые символы, отклоняются до начала вычисления.

Wasm выполняет поиск следующим образом:

1. Проверяет все входы и `scorePrefix`.
2. Один раз получает touchpoint и timestamp.
3. Формирует начальный `clickId`.
4. Один раз вычисляет frame после journey, touchpoint и properties.
5. Для текущего `clickId` вычисляет click/pulse-стадии и score.
6. Если score подходит, возвращает его; иначе применяет `incremented` и повторяет шаг 5.

Timestamp не изменяется во время перебора. `attempts` в fixtures начинается с 1 и включает принятую попытку. Оно является тестовым наблюдением и не передаётся в HTTP.

## 5. Runtime JSON

Успешный Wasm-результат имеет поля:

```json
{
  "profile": "cv2",
  "clickId": "00112233445566778899aabbccddeeff",
  "pulse": "16 lowercase hex",
  "score": "64 lowercase hex",
  "properties": []
}
```

`properties` сохраняет canonical pair array из `cv1`. TypeScript проверяет формат всех полей до создания заголовков.

## 6. HTTP-заголовки

| Заголовок | Содержимое |
|---|---|
| `X-GA-Measurement-Id` | `cv2` |
| `X-GA-Session-Id` | `pulse`, 16 hex |
| `X-Amplitude-Device-Id` | `score`, 64 hex с требуемым prefix |
| `X-Amplitude-Event-Id` | финальный `clickId`, 32 hex |
| `X-Amplitude-Session-Properties` | base64url canonical JSON свойств без padding |
| `X-YM-Counter-Client` | статическое telemetry-значение |

## 7. Будущая серверная проверка

PHP mirror должен повторить пять стадий, используя фактический маршрут, ожидаемый tag, canonical properties, полученные `clickId` и восстановленный timestamp. Дополнительно сервер:

1. Проверяет точный формат `clickId` и `score`.
2. Проверяет собственный настроенный `scorePrefix`.
3. Повторно вычисляет и сравнивает score через `hash_equals()`.
4. Возвращает generic `403` для любой ошибки без раскрытия причины.

Timestamp ограничивает срок использования результата, но без отдельного single-use хранилища не запрещает повторную отправку того же набора заголовков. Replay-cache и действия по IP/сессии не входят в текущую frontend-реализацию.
